package graph

import (
	"encoding/json"
	"fmt"
)

// Member represents a field, method, or property within a type, struct, or interface node.
type Member struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Kind        string `json:"kind,omitempty"` // "field" | "method" | "function" | "parameter"
	IsExported  bool   `json:"isExported,omitempty"`
	Description string `json:"description,omitempty"`
}

// Node represents any architectural entity in the codebase (package, file, type, function, interface, table).
type Node struct {
	ID       string            `json:"id"`
	Kind     string            `json:"kind"` // "package" | "file" | "type" | "function" | "interface" | "table"
	Name     string            `json:"name"`
	Path     string            `json:"path"`
	Metadata map[string]string `json:"metadata,omitempty"`
	Members  []Member          `json:"members,omitempty"`
}

// Edge represents a directed architectural relationship between two nodes.
type Edge struct {
	ID       string            `json:"id,omitempty"`
	From     string            `json:"from"`
	To       string            `json:"to"`
	Kind     string            `json:"kind"` // "calls" | "imports" | "implements" | "depends_on" | "contains" | "references" | "foreign_key"
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Graph represents the complete or partial architectural graph of a codebase.
type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

// New creates an empty Graph.
func New() *Graph {
	return &Graph{
		Nodes: make([]Node, 0),
		Edges: make([]Edge, 0),
	}
}

// AddNode adds a node to the graph if it doesn't already exist.
func (g *Graph) AddNode(node Node) {
	for i, existing := range g.Nodes {
		if existing.ID == node.ID {
			g.Nodes[i] = node // update existing
			return
		}
	}
	g.Nodes = append(g.Nodes, node)
}

// AddEdge adds an edge to the graph. Silently skips duplicates (same From, To, Kind).
func (g *Graph) AddEdge(edge Edge) {
	if edge.ID == "" {
		edge.ID = fmt.Sprintf("e-%s-%s-%s", edge.From, edge.To, edge.Kind)
	}
	for _, existing := range g.Edges {
		if existing.From == edge.From && existing.To == edge.To && existing.Kind == edge.Kind {
			return
		}
	}
	g.Edges = append(g.Edges, edge)
}

// NodeByID finds a node by its unique ID.
func (g *Graph) NodeByID(id string) (Node, bool) {
	for _, n := range g.Nodes {
		if n.ID == id {
			return n, true
		}
	}
	return Node{}, false
}

// NeighborsOf returns a one-hop subgraph containing the target node,
// all immediately connected nodes (incoming and outgoing), and all incident edges between them.
func (g *Graph) NeighborsOf(id string) Graph {
	_, found := g.NodeByID(id)
	if !found {
		return Graph{
			Nodes: make([]Node, 0),
			Edges: make([]Edge, 0),
		}
	}

	neighborIDs := make(map[string]struct{})
	neighborIDs[id] = struct{}{}

	var incidentEdges []Edge
	for _, edge := range g.Edges {
		if edge.From == id || edge.To == id {
			incidentEdges = append(incidentEdges, edge)
			neighborIDs[edge.From] = struct{}{}
			neighborIDs[edge.To] = struct{}{}
		}
	}

	var subgraphNodes []Node
	for _, node := range g.Nodes {
		if _, exists := neighborIDs[node.ID]; exists {
			subgraphNodes = append(subgraphNodes, node)
		}
	}

	return Graph{
		Nodes: subgraphNodes,
		Edges: incidentEdges,
	}
}

// NodesByFile returns all nodes belonging to a specific file path.
func (g *Graph) NodesByFile(filePath string) []Node {
	var results []Node
	for _, n := range g.Nodes {
		if n.Path == filePath {
			results = append(results, n)
		}
	}
	return results
}

// NodesByPackage returns all nodes belonging to a specific package name.
func (g *Graph) NodesByPackage(pkg string) []Node {
	var results []Node
	for _, n := range g.Nodes {
		if n.Metadata != nil && n.Metadata["package"] == pkg {
			results = append(results, n)
		}
	}
	return results
}

// ToJSON serializes the Graph into pretty-printed JSON bytes.
func (g *Graph) ToJSON() ([]byte, error) {
	return json.MarshalIndent(g, "", "  ")
}

// FromJSON deserializes JSON bytes into a Graph.
func FromJSON(data []byte) (*Graph, error) {
	var g Graph
	if err := json.Unmarshal(data, &g); err != nil {
		return nil, fmt.Errorf("unmarshaling graph: %w", err)
	}
	return &g, nil
}
