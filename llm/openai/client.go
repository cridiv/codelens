// Package openai provides an LLM client for any OpenAI-compatible API endpoint.
// This covers NVIDIA NIM (Nemotron, Llama, etc.), OpenAI, and self-hosted endpoints.
package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/cridiv/codelens/graph"
	"github.com/cridiv/codelens/llm"
)

const (
	// NVIDIANIMBaseURL is the base URL for NVIDIA NIM hosted models.
	NVIDIANIMBaseURL = "https://integrate.api.nvidia.com/v1"

	// DefaultModel is the Nemotron 120B MoE model on NVIDIA NIM.
	DefaultModel = "nvidia/nemotron-3-super-120b-a12b"

	defaultTimeout = 90 * time.Second
)

// Client calls any OpenAI-compatible chat completions endpoint.
type Client struct {
	baseURL    string
	apiKey     string
	model      string
	httpClient *http.Client
}

// Ensure Client satisfies the LLMClient interface at compile time.
var _ llm.LLMClient = (*Client)(nil)

// Options configures the OpenAI-compatible client.
type Options struct {
	BaseURL string // defaults to NVIDIANIMBaseURL
	APIKey  string
	Model   string // defaults to DefaultModel
	Timeout time.Duration
}

// New creates a new OpenAI-compatible LLM client.
func New(opts Options) *Client {
	if opts.BaseURL == "" {
		opts.BaseURL = NVIDIANIMBaseURL
	}
	if opts.Model == "" {
		opts.Model = DefaultModel
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = defaultTimeout
	}
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   30 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
	}

	return &Client{
		baseURL: strings.TrimRight(opts.BaseURL, "/"),
		apiKey:  opts.APIKey,
		model:   opts.Model,
		httpClient: &http.Client{
			Timeout:   timeout,
			Transport: transport,
		},
	}
}

// ── OpenAI wire types ─────────────────────────────────────────────────────────

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Explain generates a simple, beginner-friendly explanation for the given node.
func (c *Client) Explain(ctx context.Context, node graph.Node, subgraph graph.Graph, sourceCode string) (string, error) {
	prompt := buildPrompt(node, subgraph, sourceCode)

	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: prompt},
		},
		Temperature: 0.3,
		MaxTokens:   1200,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("encoding request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("creating request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("calling LLM API: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading LLM response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LLM API returned %d: %s", resp.StatusCode, string(respBytes))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBytes, &chatResp); err != nil {
		return "", fmt.Errorf("decoding LLM response: %w", err)
	}

	if chatResp.Error != nil {
		return "", fmt.Errorf("LLM API error: %s", chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("LLM returned no choices")
	}

	return strings.TrimSpace(chatResp.Choices[0].Message.Content), nil
}

// Chat answers follow-up questions about a specific code component with full context.
func (c *Client) Chat(ctx context.Context, node graph.Node, subgraph graph.Graph, sourceCode string, history []llm.ChatMessage, question string) (string, error) {
	baseContext := buildPrompt(node, subgraph, sourceCode)

	messages := []chatMessage{
		{
			Role: "system",
			Content: `You are a friendly, helpful programming teacher.
The user is inspecting a specific codebase component and asking follow-up questions about it.
Answer clearly, concisely, and in simple plain English.
Avoid unnecessary jargon. Use brief code snippets only if helpful.`,
		},
		{
			Role:    "user",
			Content: "Here is the component we are discussing:\n\n" + baseContext,
		},
		{
			Role:    "assistant",
			Content: "Understood. I have full context on this component and its relationships. What would you like to know?",
		},
	}

	for _, h := range history {
		messages = append(messages, chatMessage{
			Role:    h.Role,
			Content: h.Content,
		})
	}

	messages = append(messages, chatMessage{
		Role:    "user",
		Content: question,
	})

	reqBody := chatRequest{
		Model:       c.model,
		Messages:    messages,
		Temperature: 0.3,
		MaxTokens:   1000,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("encoding request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("creating request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("calling LLM API: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading LLM response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LLM API returned %d: %s", resp.StatusCode, string(respBytes))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBytes, &chatResp); err != nil {
		return "", fmt.Errorf("decoding LLM response: %w", err)
	}

	if chatResp.Error != nil {
		return "", fmt.Errorf("LLM API error: %s", chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("LLM returned no choices")
	}

	return strings.TrimSpace(chatResp.Choices[0].Message.Content), nil
}

// ── Prompt construction ───────────────────────────────────────────────────────

const systemPrompt = `You are a friendly, clear teacher explaining code to someone who wants simple, plain-English understanding.
Avoid heavy academic jargon or overwhelming walls of text.
Keep explanations concise, approachable, and focused on intuitive understanding.`

func buildPrompt(node graph.Node, subgraph graph.Graph, sourceCode string) string {
	pkg := node.Metadata["package"]
	if pkg == "" {
		pkg = "unknown"
	}

	var callers, callees []string
	for _, e := range subgraph.Edges {
		switch e.Kind {
		case "calls":
			if e.To == node.ID {
				if n, ok := nodeByID(subgraph, e.From); ok {
					callers = append(callers, n.Name)
				}
			} else if e.From == node.ID {
				if n, ok := nodeByID(subgraph, e.To); ok {
					callees = append(callees, n.Name)
				}
			}
		}
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "Explain this Go `%s` named `%s` in package `%s`.\n\n", node.Kind, node.Name, pkg)

	fmt.Fprintln(&sb, "### Code:")
	fmt.Fprintln(&sb, "```go")
	fmt.Fprintln(&sb, sourceCode)
	fmt.Fprintln(&sb, "```")

	if len(callers) > 0 {
		fmt.Fprintf(&sb, "\nCalled by: %s\n", strings.Join(callers, ", "))
	}
	if len(callees) > 0 {
		fmt.Fprintf(&sb, "Calls: %s\n", strings.Join(callees, ", "))
	}

	fmt.Fprintln(&sb, `
Please provide a simple, friendly explanation with these 4 short sections:

1. The Big Idea
Explain what this does in 1-2 simple sentences and a clear everyday metaphor. No technical jargon.

2. Why It Exists
Why does the codebase need this? What practical problem does it solve for the app?

3. How It Works
Break down the main steps in 3-4 simple bullet points in plain English.

4. Simple Example
Show a tiny toy example of what goes in and what comes out so anyone can visualize it.`)

	return sb.String()
}

func nodeByID(g graph.Graph, id string) (graph.Node, bool) {
	for _, n := range g.Nodes {
		if n.ID == id {
			return n, true
		}
	}
	return graph.Node{}, false
}
