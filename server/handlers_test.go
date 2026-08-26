package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/cridiv/codelens/graph"
	"github.com/cridiv/codelens/server"
)

// testGraph returns a small but representative graph for handler tests.
func testGraph() *graph.Graph {
	g := graph.New()

	g.AddNode(graph.Node{ID: "pkg:example/auth", Kind: "package", Name: "auth", Path: "auth"})
	g.AddNode(graph.Node{ID: "file:auth/service.go", Kind: "file", Name: "service.go", Path: "auth/service.go"})
	g.AddNode(graph.Node{
		ID: "fn:example/auth.Login", Kind: "function", Name: "Login", Path: "auth/service.go",
		Metadata: map[string]string{"signature": "func Login(...)"},
	})
	g.AddNode(graph.Node{ID: "type:example/auth.AuthService", Kind: "type", Name: "AuthService", Path: "auth/service.go"})

	g.AddEdge(graph.Edge{From: "pkg:example/auth", To: "file:auth/service.go", Kind: "contains"})
	g.AddEdge(graph.Edge{From: "file:auth/service.go", To: "fn:example/auth.Login", Kind: "contains"})
	g.AddEdge(graph.Edge{From: "file:auth/service.go", To: "type:example/auth.AuthService", Kind: "contains"})

	return g
}

func testServer() *server.Server {
	return server.New(server.Options{
		Port:  5555,
		Graph: testGraph(),
	})
}

// ── GET /api/graph ────────────────────────────────────────────────────────────

func TestHandleGraph_OK(t *testing.T) {
	srv := testServer()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/graph", nil)

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var g graph.Graph
	if err := json.NewDecoder(rec.Body).Decode(&g); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(g.Nodes) == 0 {
		t.Error("expected non-empty nodes in graph response")
	}
	if len(g.Edges) == 0 {
		t.Error("expected non-empty edges in graph response")
	}
}

func TestHandleGraph_MethodNotAllowed(t *testing.T) {
	srv := testServer()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/graph", nil)

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

// ── GET /api/node/:id ─────────────────────────────────────────────────────────

func TestHandleNode_SingleNode_OK(t *testing.T) {
	srv := testServer()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/node/fn:example/auth.Login", nil)

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", rec.Code, rec.Body.String())
	}

	var node graph.Node
	if err := json.NewDecoder(rec.Body).Decode(&node); err != nil {
		t.Fatalf("decoding node: %v", err)
	}
	if node.ID != "fn:example/auth.Login" {
		t.Errorf("expected ID fn:example/auth.Login, got %s", node.ID)
	}
}

func TestHandleNode_NotFound(t *testing.T) {
	srv := testServer()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/node/nonexistent", nil)

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

// ── GET /api/node/:id/neighbors ───────────────────────────────────────────────

func TestHandleNode_Neighbors_OK(t *testing.T) {
	srv := testServer()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/node/file:auth/service.go/neighbors", nil)

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Nodes []graph.Node `json:"nodes"`
		Edges []graph.Edge `json:"edges"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding neighbors response: %v", err)
	}
	if len(resp.Nodes) == 0 {
		t.Error("expected at least one neighbor node")
	}
	// The queried node itself must always be included.
	found := false
	for _, n := range resp.Nodes {
		if n.ID == "file:auth/service.go" {
			found = true
			break
		}
	}
	if !found {
		t.Error("queried node should be included in neighbors response")
	}
}

// ── POST /api/explain ─────────────────────────────────────────────────────────

func TestHandleExplain_NoProvider(t *testing.T) {
	// Server with nil LLM should return 503.
	srv := testServer()
	rec := httptest.NewRecorder()
	body := `{"nodeId": "fn:example/auth.Login"}`
	req := httptest.NewRequest(http.MethodPost, "/api/explain", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when no LLM configured, got %d", rec.Code)
	}
}

func TestHandleExplain_MissingNodeID(t *testing.T) {
	srv := testServer()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/explain", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")

	srv.ServeHTTP(rec, req)

	// 503 because nil LLM is checked first — adjust if LLM is pre-populated.
	if rec.Code != http.StatusServiceUnavailable && rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 or 503, got %d", rec.Code)
	}
}

// ── CORS preflight ────────────────────────────────────────────────────────────

func TestCORSPreflight(t *testing.T) {
	srv := testServer()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/api/graph", nil)

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("expected CORS header Access-Control-Allow-Origin: *")
	}
}
