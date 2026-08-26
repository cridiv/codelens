package golang

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestAnalyzeSimpleFixture(t *testing.T) {
	fixturePath, err := filepath.Abs("../../testdata/simple")
	if err != nil {
		t.Fatalf("resolving fixture path: %v", err)
	}

	az := New()
	g, err := az.Analyze(fixturePath)
	if err != nil {
		t.Fatalf("analyzing fixture repo failed: %v", err)
	}
	if g == nil {
		t.Fatalf("expected non-nil graph")
	}

	// ── 1. Package nodes ─────────────────────────────────────────────────────

	expectedPkgs := []string{"main", "auth", "store"}
	for _, expected := range expectedPkgs {
		found := false
		for _, n := range g.Nodes {
			if n.Kind == "package" && n.Name == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected package node '%s' not found", expected)
		}
	}

	// ── 2. Key type / interface nodes ─────────────────────────────────────────

	expectedTypes := map[string]string{
		"Store":       "interface",
		"MemoryStore": "type",
		"AuthService": "type",
	}
	for name, kind := range expectedTypes {
		found := false
		for _, n := range g.Nodes {
			if n.Kind == kind && n.Name == name {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected entity '%s' (kind: %s) not found", name, kind)
		}
	}

	// ── 3. Specific implements edge: MemoryStore → Store ─────────────────────

	var memStoreID, storeID string
	for _, n := range g.Nodes {
		if n.Name == "MemoryStore" && n.Kind == "type" {
			memStoreID = n.ID
		}
		if n.Name == "Store" && n.Kind == "interface" {
			storeID = n.ID
		}
	}
	if memStoreID == "" {
		t.Fatalf("MemoryStore node not found — cannot check implements edge")
	}
	if storeID == "" {
		t.Fatalf("Store node not found — cannot check implements edge")
	}

	foundImplements := false
	for _, e := range g.Edges {
		if e.Kind == "implements" && e.From == memStoreID && e.To == storeID {
			foundImplements = true
			break
		}
	}
	if !foundImplements {
		t.Errorf("expected implements edge from %s → %s, not found", memStoreID, storeID)
	}

	// ── 4. Specific reference edge: AuthService → Store ──────────────────────

	var authServiceID string
	for _, n := range g.Nodes {
		if n.Name == "AuthService" && n.Kind == "type" {
			authServiceID = n.ID
			break
		}
	}
	if authServiceID == "" {
		t.Fatalf("AuthService node not found — cannot check references edge")
	}

	foundReference := false
	for _, e := range g.Edges {
		if e.Kind == "references" && e.From == authServiceID && e.To == storeID {
			foundReference = true
			break
		}
	}
	if !foundReference {
		t.Errorf("expected references edge from %s → %s, not found", authServiceID, storeID)
	}

	// ── 5. Specific calls edge: Login calls Store.Set ─────────────────────────
	//
	// a.Store.Set() is a call on a store.Store interface value. Go's type
	// checker resolves it to the interface method, not a concrete impl, so
	// the callee ID is fn:example.com/simple/store.Store.Set.

	var loginID, storeIfaceSetID string
	for _, n := range g.Nodes {
		if n.Kind == "function" && n.Name == "Login" {
			loginID = n.ID
		}
		// Interface method node: receiver == "Store" (the interface type name)
		if n.Kind == "function" && n.Name == "Set" && n.Metadata["receiver"] == "Store" {
			storeIfaceSetID = n.ID
		}
	}
	if loginID == "" {
		t.Fatalf("Login function node not found")
	}
	if storeIfaceSetID == "" {
		t.Fatalf("Store.Set interface method node not found")
	}

	foundCall := false
	for _, e := range g.Edges {
		if e.Kind == "calls" && e.From == loginID && e.To == storeIfaceSetID {
			foundCall = true
			break
		}
	}
	if !foundCall {
		t.Errorf("expected calls edge from %s → %s, not found", loginID, storeIfaceSetID)
	}

	// ── 6. No duplicate edges ─────────────────────────────────────────────────

	type edgeKey struct{ from, to, kind string }
	seen := make(map[edgeKey]struct{})
	for _, e := range g.Edges {
		key := edgeKey{e.From, e.To, e.Kind}
		if _, dup := seen[key]; dup {
			t.Errorf("duplicate edge found: %s → %s (%s)", e.From, e.To, e.Kind)
		}
		seen[key] = struct{}{}
	}

	// ── 7. Contains edges: package → file, file → type/function ─────────────

	containsCount := 0
	for _, e := range g.Edges {
		if e.Kind == "contains" {
			containsCount++
		}
	}
	if containsCount < 5 {
		t.Errorf("expected at least 5 'contains' edges, got %d", containsCount)
	}
}

func TestAnalyzeSelf(t *testing.T) {
	rootPath, err := filepath.Abs("../..")
	if err != nil {
		t.Fatalf("resolving repo root path: %v", err)
	}

	az := New()
	g, err := az.Analyze(rootPath)
	if err != nil {
		t.Fatalf("analyzing codelens itself failed: %v", err)
	}

	if len(g.Nodes) == 0 {
		t.Errorf("expected non-empty graph, got 0 nodes")
	}

	// Verify graph package is present
	foundGraphPkg := false
	for _, n := range g.Nodes {
		if n.Kind == "package" && strings.Contains(n.ID, "graph") {
			foundGraphPkg = true
			break
		}
	}
	if !foundGraphPkg {
		t.Errorf("expected to find the 'graph' package node in self-analysis")
	}

	// Verify no duplicate edges
	type edgeKey struct{ from, to, kind string }
	seen := make(map[edgeKey]struct{})
	for _, e := range g.Edges {
		key := edgeKey{e.From, e.To, e.Kind}
		if _, dup := seen[key]; dup {
			t.Errorf("duplicate edge in self-analysis: %s → %s (%s)", e.From, e.To, e.Kind)
		}
		seen[key] = struct{}{}
	}

	t.Logf("Self-analysis: %d nodes, %d edges", len(g.Nodes), len(g.Edges))
}
