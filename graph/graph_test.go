package graph

import (
	"reflect"
	"testing"
)

func sampleTestGraph() *Graph {
	g := New()
	g.AddNode(Node{
		ID:   "pkg:auth",
		Kind: "type",
		Name: "AuthService",
		Path: "internal/auth/service.go",
		Metadata: map[string]string{
			"package": "auth",
			"file":    "service.go",
			"doc":     "Core auth service",
		},
	})
	g.AddNode(Node{
		ID:   "type:token_claims",
		Kind: "type",
		Name: "TokenClaims",
		Path: "internal/auth/service.go",
		Metadata: map[string]string{
			"package": "auth",
			"file":    "service.go",
		},
	})
	g.AddNode(Node{
		ID:   "pkg:user",
		Kind: "type",
		Name: "User",
		Path: "internal/models/user.go",
		Metadata: map[string]string{
			"package": "models",
			"file":    "user.go",
		},
	})
	g.AddNode(Node{
		ID:   "pkg:database",
		Kind: "type",
		Name: "DatabaseEngine",
		Path: "internal/db/postgres.go",
		Metadata: map[string]string{
			"package": "db",
			"file":    "postgres.go",
		},
	})

	g.AddEdge(Edge{
		ID:   "e-auth-claims",
		From: "pkg:auth",
		To:   "type:token_claims",
		Kind: "references",
	})
	g.AddEdge(Edge{
		ID:   "e-auth-user",
		From: "pkg:auth",
		To:   "pkg:user",
		Kind: "references",
	})
	g.AddEdge(Edge{
		ID:   "e-auth-db",
		From: "pkg:auth",
		To:   "pkg:database",
		Kind: "depends_on",
	})

	return g
}

func TestJSONRoundTrip(t *testing.T) {
	original := sampleTestGraph()

	data, err := original.ToJSON()
	if err != nil {
		t.Fatalf("failed to marshal graph: %v", err)
	}

	restored, err := FromJSON(data)
	if err != nil {
		t.Fatalf("failed to unmarshal graph: %v", err)
	}

	if len(restored.Nodes) != len(original.Nodes) {
		t.Errorf("expected %d nodes, got %d", len(original.Nodes), len(restored.Nodes))
	}
	if len(restored.Edges) != len(original.Edges) {
		t.Errorf("expected %d edges, got %d", len(original.Edges), len(restored.Edges))
	}

	for _, origNode := range original.Nodes {
		resNode, found := restored.NodeByID(origNode.ID)
		if !found {
			t.Errorf("node %s missing in restored graph", origNode.ID)
			continue
		}
		if resNode.Name != origNode.Name || resNode.Kind != origNode.Kind || resNode.Path != origNode.Path {
			t.Errorf("node mismatch: expected %+v, got %+v", origNode, resNode)
		}
	}
}

func TestNodeByID(t *testing.T) {
	g := sampleTestGraph()

	node, found := g.NodeByID("pkg:auth")
	if !found {
		t.Fatalf("expected node pkg:auth to be found")
	}
	if node.Name != "AuthService" {
		t.Errorf("expected name 'AuthService', got '%s'", node.Name)
	}

	_, notFound := g.NodeByID("non-existent-id")
	if notFound {
		t.Errorf("expected non-existent node not to be found")
	}
}

func TestNeighborsOf(t *testing.T) {
	g := sampleTestGraph()

	// Query neighbors of pkg:auth
	subgraph := g.NeighborsOf("pkg:auth")

	if len(subgraph.Nodes) != 4 {
		t.Errorf("expected 4 nodes in subgraph (target + 3 neighbors), got %d", len(subgraph.Nodes))
	}
	if len(subgraph.Edges) != 3 {
		t.Errorf("expected 3 incident edges, got %d", len(subgraph.Edges))
	}

	// Query neighbors of isolated node pkg:database
	dbSubgraph := g.NeighborsOf("pkg:database")
	if len(dbSubgraph.Nodes) != 2 { // DatabaseEngine + AuthService
		t.Errorf("expected 2 nodes in db subgraph, got %d", len(dbSubgraph.Nodes))
	}
	if len(dbSubgraph.Edges) != 1 {
		t.Errorf("expected 1 edge in db subgraph, got %d", len(dbSubgraph.Edges))
	}

	// Query unknown node
	emptySubgraph := g.NeighborsOf("unknown-id")
	if len(emptySubgraph.Nodes) != 0 || len(emptySubgraph.Edges) != 0 {
		t.Errorf("expected empty subgraph for unknown node ID")
	}
}

func TestNodesByFileAndPackage(t *testing.T) {
	g := sampleTestGraph()

	authFileNodes := g.NodesByFile("internal/auth/service.go")
	if len(authFileNodes) != 2 {
		t.Errorf("expected 2 nodes in service.go, got %d", len(authFileNodes))
	}

	authPkgNodes := g.NodesByPackage("auth")
	if len(authPkgNodes) != 2 {
		t.Errorf("expected 2 nodes in auth package, got %d", len(authPkgNodes))
	}

	modelsPkgNodes := g.NodesByPackage("models")
	if len(modelsPkgNodes) != 1 {
		t.Errorf("expected 1 node in models package, got %d", len(modelsPkgNodes))
	}
}

func TestAddNodeAndEdge(t *testing.T) {
	g := New()
	n1 := Node{ID: "n1", Name: "Node 1", Kind: "type"}
	g.AddNode(n1)

	if len(g.Nodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(g.Nodes))
	}

	// Overwrite node
	n1Updated := Node{ID: "n1", Name: "Node 1 Updated", Kind: "type"}
	g.AddNode(n1Updated)
	if len(g.Nodes) != 1 {
		t.Errorf("expected still 1 node after update, got %d", len(g.Nodes))
	}
	if g.Nodes[0].Name != "Node 1 Updated" {
		t.Errorf("expected updated name, got %s", g.Nodes[0].Name)
	}

	// Add Edge with auto-generated ID
	g.AddEdge(Edge{From: "n1", To: "n2", Kind: "calls"})
	if len(g.Edges) != 1 {
		t.Fatalf("expected 1 edge, got %d", len(g.Edges))
	}
	if g.Edges[0].ID != "e-n1-n2-calls" {
		t.Errorf("expected auto ID 'e-n1-n2-calls', got '%s'", g.Edges[0].ID)
	}

	_ = reflect.TypeOf(g)
}
