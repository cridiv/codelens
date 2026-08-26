package llm

import (
	"context"

	"github.com/cridiv/codelens/graph"
)

// LLMClient is the language-model abstraction used by the server.
// Implementations live in llm/ollama, llm/openai, and llm/anthropic.
//
// Explain generates a layered architectural explanation for a single node,
// using the node's source code and its immediate subgraph as context.
type LLMClient interface {
	Explain(ctx context.Context, node graph.Node, subgraph graph.Graph, sourceCode string) (string, error)
}
