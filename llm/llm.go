package llm

import (
	"context"

	"github.com/cridiv/codelens/graph"
)

// ChatMessage represents a single message turn in follow-up conversations.
type ChatMessage struct {
	Role    string `json:"role"`    // "user" or "assistant"
	Content string `json:"content"` // message body
}

// LLMClient is the language-model abstraction used by the server.
// Implementations live in llm/ollama, llm/openai, and llm/anthropic.
//
// Explain generates a layered architectural explanation for a single node,
// using the node's source code and its immediate subgraph as context.
type LLMClient interface {
	Explain(ctx context.Context, node graph.Node, subgraph graph.Graph, sourceCode string) (string, error)
	Chat(ctx context.Context, node graph.Node, subgraph graph.Graph, sourceCode string, history []ChatMessage, question string) (string, error)
}
