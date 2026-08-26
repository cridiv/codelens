package openai_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/cridiv/codelens/graph"
	"github.com/cridiv/codelens/llm/openai"
)

func TestExplainMockServer(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-api-key" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		resp := map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]string{
						"content": "1. Background\nCore explanation context.\n\n2. Intuition\nMental model.\n\n3. Code Walkthrough\nStep by step.\n\n4. Dependencies & Graph Position\nNeighbors.\n\n5. Key Takeaways & Edge Cases\nInvariants.",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	client := openai.New(openai.Options{
		BaseURL: ts.URL,
		APIKey:  "test-api-key",
		Model:   "meta/llama-3.1-70b-instruct",
		Timeout: 5 * time.Second,
	})

	dummyNode := graph.Node{
		ID:   "fn:main",
		Kind: "function",
		Name: "main",
		Path: "main.go",
		Metadata: map[string]string{
			"package":   "main",
			"signature": "func main()",
		},
	}

	explanation, err := client.Explain(context.Background(), dummyNode, graph.Graph{}, "func main() {}")
	if err != nil {
		t.Fatalf("Explain failed: %v", err)
	}

	if len(explanation) == 0 {
		t.Errorf("expected non-empty explanation")
	}
}
