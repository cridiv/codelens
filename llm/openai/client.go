// Package openai provides an LLM client for any OpenAI-compatible API endpoint.
// This covers NVIDIA NIM (Llama, Nemotron, etc.), OpenAI, and self-hosted endpoints.
package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/cridiv/codelens/graph"
	"github.com/cridiv/codelens/llm"
)

const (
	// NVIDIANIMBaseURL is the base URL for NVIDIA NIM hosted models.
	NVIDIANIMBaseURL = "https://integrate.api.nvidia.com/v1"

	// DefaultModel is the Llama-70B model on NVIDIA NIM.
	DefaultModel = "meta/llama-3.1-70b-instruct"

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
	return &Client{
		baseURL: strings.TrimRight(opts.BaseURL, "/"),
		apiKey:  opts.APIKey,
		model:   opts.Model,
		httpClient: &http.Client{
			Timeout: timeout,
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

// Explain generates a layered architectural explanation for the given node.
func (c *Client) Explain(ctx context.Context, node graph.Node, subgraph graph.Graph, sourceCode string) (string, error) {
	prompt := buildPrompt(node, subgraph, sourceCode)

	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: prompt},
		},
		Temperature: 0.2,
		MaxTokens:   2500,
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

const systemPrompt = `You are a distinguished systems architect and technical writer with the educational clarity, rigor, and engaging flow of Martin Kleppmann (author of Designing Data-Intensive Applications).
Explain codebase components with crystal-clear intuition, concrete examples, and precise architectural context.
Ensure transitions between sections are natural and engaging.`

func buildPrompt(node graph.Node, subgraph graph.Graph, sourceCode string) string {
	pkg := node.Metadata["package"]
	if pkg == "" {
		pkg = "unknown"
	}

	var callers, callees, types []string
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
		case "implements", "references":
			if e.From == node.ID {
				if n, ok := nodeByID(subgraph, e.To); ok {
					types = append(types, n.Name)
				}
			}
		}
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "Explain the Go component `%s` (%s) in package `%s` located at `%s`.\n\n", node.Name, node.Kind, pkg, node.Path)

	fmt.Fprintln(&sb, "### Code Context / Signature:")
	fmt.Fprintln(&sb, "```go")
	fmt.Fprintln(&sb, sourceCode)
	fmt.Fprintln(&sb, "```")

	if len(callers) > 0 {
		fmt.Fprintf(&sb, "\n- Inbound Callers: %s\n", strings.Join(callers, ", "))
	}
	if len(callees) > 0 {
		fmt.Fprintf(&sb, "- Outbound Calls: %s\n", strings.Join(callees, ", "))
	}
	if len(types) > 0 {
		fmt.Fprintf(&sb, "- Types Implemented / Referenced: %s\n", strings.Join(types, ", "))
	}

	fmt.Fprintln(&sb, `
Please structure your architectural explanation strictly with these sections:

1. Background
Provide the necessary context. Include a deep, accessible background for someone new to this area of the codebase, followed by the narrow context directly relevant to this specific component and package.

2. Intuition
Explain the core mental model and purpose. Why does this design exist? Use a simple, concrete example with toy data or visual representations to illustrate how data or control flows through it.

3. Code Walkthrough
Walk through the mechanics of the implementation in an orderly, understandable sequence. Highlight the main responsibilities, invariants, and key decision points.

4. Dependencies & Graph Position
Describe how this component interacts with the surrounding system (callers, callees, and data models). Explain what upstream callers rely on it for, and what lower-level subsystems it delegates work to.

5. Key Takeaways & Edge Cases
Highlight crucial invariants, failure modes, concurrency/lifecycle considerations, or non-obvious details to keep in mind.`)

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
