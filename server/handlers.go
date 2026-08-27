package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/cridiv/codelens/graph"
	"github.com/cridiv/codelens/llm"
)

// writeJSON encodes v as JSON and writes it to w with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// At this point the status code is already sent; just log.
		http.Error(w, "encoding response", http.StatusInternalServerError)
	}
}

// writeError writes a { "error": "..." } JSON body with the given status code.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ── GET /api/graph ────────────────────────────────────────────────────────────

// handleGraph returns the full graph as JSON.
//
//	Response: graph.Graph
func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, s.graph)
}

// ── GET /api/node/:id  /  GET /api/node/:id/neighbors ─────────────────────────

// handleNode dispatches between single-node and neighbors requests based on
// whether the path ends with "/neighbors".
//
//	GET /api/node/:id           → graph.Node
//	GET /api/node/:id/neighbors → { nodes: []Node, edges: []Edge }
func (s *Server) handleNode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Strip the "/api/node/" prefix to get the remainder.
	remainder := strings.TrimPrefix(r.URL.Path, "/api/node/")
	if remainder == "" {
		writeError(w, http.StatusBadRequest, "node ID is required")
		return
	}

	// Detect /api/node/:id/source
	sourceRequest := strings.HasSuffix(remainder, "/source")
	if sourceRequest {
		remainder = strings.TrimSuffix(remainder, "/source")
	}

	// Detect /api/node/:id/neighbors
	neighborsRequest := strings.HasSuffix(remainder, "/neighbors")
	nodeID := remainder
	if neighborsRequest {
		nodeID = strings.TrimSuffix(remainder, "/neighbors")
	}

	if nodeID == "" {
		writeError(w, http.StatusBadRequest, "node ID is required")
		return
	}

	node, ok := s.graph.NodeByID(nodeID)
	if !ok {
		writeError(w, http.StatusNotFound, fmt.Sprintf("node %q not found", nodeID))
		return
	}

	if sourceRequest {
		code := s.readNodeSourceCode(node)
		writeJSON(w, http.StatusOK, map[string]string{
			"id":         node.ID,
			"name":       node.Name,
			"path":       node.Path,
			"code":       code,
			"start_line": node.Metadata["start_line"],
			"end_line":   node.Metadata["end_line"],
		})
		return
	}

	if !neighborsRequest {
		writeJSON(w, http.StatusOK, node)
		return
	}

	// Build one-hop subgraph
	sub := s.graph.NeighborsOf(nodeID)

	// Always include the queried node itself in the returned node set.
	nodePresent := false
	for _, n := range sub.Nodes {
		if n.ID == nodeID {
			nodePresent = true
			break
		}
	}
	if !nodePresent {
		sub.Nodes = append([]graph.Node{node}, sub.Nodes...)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"nodes": sub.Nodes,
		"edges": sub.Edges,
	})
}

// ── POST /api/explain ─────────────────────────────────────────────────────────

// explainRequest is the JSON body for the explain endpoint.
type explainRequest struct {
	NodeID string `json:"nodeId"`
}

// handleExplain calls the LLM to generate an architectural explanation for a
// node and returns the result as a JSON string.
//
//	Request:  { "nodeId": "fn:github.com/cridiv/codelens/server.handleExplain" }
//	Response: { "explanation": "..." }
func (s *Server) handleExplain(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if s.llm == nil {
		writeError(w, http.StatusServiceUnavailable, "no LLM provider configured")
		return
	}

	var req explainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("decoding request body: %v", err))
		return
	}
	if req.NodeID == "" {
		writeError(w, http.StatusBadRequest, "nodeId is required")
		return
	}

	node, ok := s.graph.NodeByID(req.NodeID)
	if !ok {
		writeError(w, http.StatusNotFound, fmt.Sprintf("node %q not found", req.NodeID))
		return
	}

	// Check server-side explanation cache
	if cached, ok := s.explainCache.Load(req.NodeID); ok {
		if explanationStr, ok := cached.(string); ok && explanationStr != "" {
			writeJSON(w, http.StatusOK, map[string]string{"explanation": explanationStr})
			return
		}
	}

	// Build a one-hop subgraph to give the LLM contextual neighbours.
	subgraph := s.graph.NeighborsOf(req.NodeID)

	// Retrieve actual source code from disk for this node
	sourceCode := s.readNodeSourceCode(node)

	explanation, err := s.llm.Explain(r.Context(), node, subgraph, sourceCode)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("generating explanation: %v", err))
		return
	}

	// Save to in-memory cache
	s.explainCache.Store(req.NodeID, explanation)

	// Persist to disk cache asynchronously
	if s.repoPath != "" {
		go s.persistExplanationCache()
	}

	writeJSON(w, http.StatusOK, map[string]string{"explanation": explanation})
}

type chatRequestPayload struct {
	NodeID   string            `json:"nodeId"`
	Question string            `json:"question"`
	History  []llm.ChatMessage `json:"history"`
}

// handleChat answers interactive follow-up questions about the targeted node.
func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if s.llm == nil {
		writeError(w, http.StatusServiceUnavailable, "no LLM provider configured")
		return
	}

	var req chatRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("decoding request body: %v", err))
		return
	}
	if req.NodeID == "" {
		writeError(w, http.StatusBadRequest, "nodeId is required")
		return
	}
	if strings.TrimSpace(req.Question) == "" {
		writeError(w, http.StatusBadRequest, "question is required")
		return
	}

	node, ok := s.graph.NodeByID(req.NodeID)
	if !ok {
		writeError(w, http.StatusNotFound, fmt.Sprintf("node %q not found", req.NodeID))
		return
	}

	subgraph := s.graph.NeighborsOf(req.NodeID)
	sourceCode := s.readNodeSourceCode(node)

	answer, err := s.llm.Chat(r.Context(), node, subgraph, sourceCode, req.History, req.Question)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("answering question: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"answer": answer})
}

// persistExplanationCache writes the full in-memory explanation cache to disk.
func (s *Server) persistExplanationCache() {
	cacheDir := filepath.Join(s.repoPath, ".codelens-cache")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return
	}
	cacheFile := filepath.Join(cacheDir, "explanations.json")

	diskMap := make(map[string]string)
	s.explainCache.Range(func(key, value any) bool {
		if k, ok := key.(string); ok {
			if v, ok := value.(string); ok {
				diskMap[k] = v
			}
		}
		return true
	})

	if data, err := json.MarshalIndent(diskMap, "", "  "); err == nil {
		_ = os.WriteFile(cacheFile, data, 0o644)
	}
}

// readNodeSourceCode reads the real source code from disk for the targeted entity,
// returning only the relevant declaration without dumping unrelated code.
func (s *Server) readNodeSourceCode(n graph.Node) string {
	if n.Path == "" {
		return formatNodeAsSourceHint(n)
	}

	targetPath := n.Path
	if !filepath.IsAbs(targetPath) && s.repoPath != "" {
		targetPath = filepath.Join(s.repoPath, n.Path)
	}

	data, err := os.ReadFile(targetPath)
	if err != nil {
		return formatNodeAsSourceHint(n)
	}

	lines := strings.Split(string(data), "\n")
	startLineStr := n.Metadata["start_line"]
	endLineStr := n.Metadata["end_line"]

	if startLineStr != "" && endLineStr != "" {
		var start, end int
		if _, err := fmt.Sscanf(startLineStr, "%d", &start); err == nil {
			if _, err := fmt.Sscanf(endLineStr, "%d", &end); err == nil {
				if start > 0 && end >= start && start <= len(lines) {
					if end > len(lines) {
						end = len(lines)
					}
					// Include doc comments right above if any
					actualStart := start - 1
					for actualStart > 0 && (strings.HasPrefix(strings.TrimSpace(lines[actualStart-1]), "//") || strings.TrimSpace(lines[actualStart-1]) == "") {
						if strings.TrimSpace(lines[actualStart-1]) == "" && actualStart < start-1 {
							break
						}
						actualStart--
					}
					return strings.Join(lines[actualStart:end], "\n")
				}
			}
		}
	}

	// For specific functions or types with signature, return signature and doc
	if n.Kind == "function" || n.Kind == "type" || n.Kind == "interface" {
		return formatNodeAsSourceHint(n)
	}

	// For files, return top 60 lines
	if len(lines) > 60 {
		return strings.Join(lines[:60], "\n") + "\n\n// ... (truncated for brevity)"
	}

	return string(data)
}

// formatNodeAsSourceHint produces a human-readable summary of a node's metadata.
func formatNodeAsSourceHint(n graph.Node) string {
	lines := []string{
		fmt.Sprintf("// Node: %s", n.Name),
		fmt.Sprintf("// Kind: %s", n.Kind),
		fmt.Sprintf("// Path: %s", n.Path),
	}
	if sig, ok := n.Metadata["signature"]; ok && sig != "" {
		lines = append(lines, sig)
	}
	if doc, ok := n.Metadata["doc"]; ok && doc != "" {
		lines = append(lines, "// "+doc)
	}
	return strings.Join(lines, "\n")
}
