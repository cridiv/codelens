package analyzer

import "github.com/cridiv/codelens/graph"

// Analyzer represents a language-agnostic static analyzer interface.
type Analyzer interface {
	Analyze(repoPath string) (*graph.Graph, error)
}
