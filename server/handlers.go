package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/cridiv/codelens/graph"
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

	// Build a one-hop subgraph to give the LLM contextual neighbours.
	subgraph := s.graph.NeighborsOf(req.NodeID)

	// TODO: supply actual source code from disk (Phase 5 / cache).
	// For now we pass the node's metadata as a stand-in.
	sourceCode := formatNodeAsSourceHint(node)

	explanation, err := s.llm.Explain(context.Background(), node, subgraph, sourceCode)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("generating explanation: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"explanation": explanation})
}

// formatNodeAsSourceHint produces a human-readable summary of a node's metadata
// to substitute for real source code until disk-reading is implemented.
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
