// Package openai provides an LLM client for any OpenAI-compatible API endpoint.
// This covers OpenAI, NVIDIA NIM (DeepSeek, Llama, etc.), and self-hosted vLLM.
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

	// DefaultModel is the latest DeepSeek model available on NVIDIA NIM.
	DefaultModel = "deepseek-ai/deepseek-v4-flash-0731"

	defaultTimeout = 120 * time.Second
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
		Temperature: 0.3,
		MaxTokens:   2048,
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

const systemPrompt = `You are an expert software architect explaining Go codebases to developers.
Be precise, concrete, and grounded in the actual code context provided.
Never hallucinate dependencies or behaviors not shown in the graph or source.
Structure your response with clear numbered sections.`

func buildPrompt(node graph.Node, subgraph graph.Graph, sourceCode string) string {
	pkg := node.Metadata["package"]
	if pkg == "" {
		pkg = "unknown"
	}

	// Summarise neighbours concisely
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
	fmt.Fprintf(&sb, "Explain the following Go %s named %q in package %q.\n\n", node.Kind, node.Name, pkg)

	fmt.Fprintln(&sb, "Source code / signature:")
	fmt.Fprintln(&sb, "```go")
	fmt.Fprintln(&sb, sourceCode)
	fmt.Fprintln(&sb, "```")

	if len(callers) > 0 {
		fmt.Fprintf(&sb, "\nCalled by: %s\n", strings.Join(callers, ", "))
	}
	if len(callees) > 0 {
		fmt.Fprintf(&sb, "Calls: %s\n", strings.Join(callees, ", "))
	}
	if len(types) > 0 {
		fmt.Fprintf(&sb, "Implements/References: %s\n", strings.Join(types, ", "))
	}

	fmt.Fprintln(&sb, `
Please structure your explanation exactly as:

1. High-level intuition — what is this trying to accomplish?
2. Purpose — why does it exist in this system?
3. How it works — what are the major steps or responsibilities?
4. Dependencies — what does it call, what calls it, what types does it depend on?
5. Code-level detail — what do the important implementation choices mean?`)

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
