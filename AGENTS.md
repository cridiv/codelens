# CodeLens — Agent Instructions

> **Tagline**: Don't just read the codebase. Explore it.

This file is the authoritative guide for AI agents working on the CodeLens project. Read it fully before making any changes.

---

## Project Overview

CodeLens is a local developer tool that scans a codebase and renders its architecture as an interactive visual map in the browser. It combines three things that currently exist separately:

- **Static analysis** — parse the codebase without executing it
- **Interactive visualization** — explore the graph with zoom, pan, drill-down
- **Contextual AI explanation** — select any node, get an architecturally-aware explanation

**Entry point**: `codeatlas .` — one command, runs the analyzer, starts a local server, opens the UI at `localhost:5555`.

---

## Monorepo Structure

```
codelens/
├── cmd/
│   └── codeatlas/
│       └── main.go           # CLI entrypoint, flag parsing
├── analyzer/
│   ├── analyzer.go           # Analyzer interface (language-agnostic)
│   └── golang/
│       └── analyzer.go       # Go implementation (go/ast, go/packages, go/types)
├── graph/
│   └── graph.go              # Node, Edge, Graph types — shared across all layers
├── server/
│   ├── server.go             # HTTP server bootstrap (Chi or net/http)
│   └── handlers.go           # REST API route handlers
├── llm/
│   ├── llm.go                # LLMClient interface
│   ├── ollama/               # Ollama implementation
│   ├── openai/               # OpenAI-compatible implementation
│   └── anthropic/            # Anthropic implementation
├── ui/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Canvas.tsx            # React Flow graph canvas
│   │   │   ├── HierarchyPanel.tsx    # Left sidebar — tree view
│   │   │   └── ExplanationPanel.tsx  # Right sidebar — AI explanation
│   │   └── hooks/
│   │       └── useGraph.ts           # Data fetching and graph state
│   ├── package.json
│   └── dist/                         # Built output — embedded into Go binary
├── AGENTS.md                         # This file
├── implementation.md                 # Phased build plan
├── codeatlas.config.json             # User config (gitignored)
├── go.mod
└── go.sum
```

---

## Core Domain Types

These types are the lingua franca of the entire system. All layers — analyzer, server, UI — communicate through these shapes.

```go
// graph/graph.go

type Node struct {
    ID       string            // unique, e.g. "pkg:github.com/user/repo/auth"
    Kind     string            // "package" | "file" | "function" | "type"
    Name     string            // human-readable label
    Path     string            // file path or package import path
    Metadata map[string]string // kind-specific extras (e.g. "signature", "receiver")
}

type Edge struct {
    From string // Node.ID
    To   string // Node.ID
    Kind string // "calls" | "imports" | "implements" | "depends_on" | "contains"
}

type Graph struct {
    Nodes []Node
    Edges []Edge
}
```

Never add language-specific fields to these types. Language-specific data goes into `Metadata`.

---

## Analyzer Interface

```go
// analyzer/analyzer.go

type Analyzer interface {
    Analyze(repoPath string) (*graph.Graph, error)
}
```

**Rule**: Every language analyzer must implement exactly this interface and nothing else. The server, UI, and LLM layer must remain completely unaware of which analyzer produced the graph.

When building the Go analyzer (`analyzer/golang/analyzer.go`):
- Use `golang.org/x/tools/go/packages` for loading packages with type info
- Use `go/ast` for traversal
- Use `go/types` for interface satisfaction checks
- Do not use `exec.Command` to invoke external tools — parse statically
- Extract: packages, files, functions, methods, types, structs, call edges (intra + cross package), import edges, interface implementation edges, `contains` edges (package→file, file→function)

---

## REST API Contract

The server exposes this API. Do not change route shapes without updating both the handlers and the UI hooks.

```
GET  /api/graph                → graph.Graph (full graph JSON)
GET  /api/node/:id             → graph.Node (single node details)
GET  /api/node/:id/neighbors   → { nodes: Node[], edges: Edge[] } (one-hop subgraph)
POST /api/explain              → { nodeId: string } → { explanation: string } (LLM response)
```

All responses are `application/json`. Errors return `{ "error": "..." }` with an appropriate HTTP status code.

The server embeds the UI via `go:embed`:
```go
//go:embed ui/dist
var uiFiles embed.FS
```

The UI is served at `/` for any route not matching `/api/*`.

---

## LLM Interface

```go
// llm/llm.go

type LLMClient interface {
    Explain(ctx context.Context, node graph.Node, subgraph graph.Graph, sourceCode string) (string, error)
}
```

Implementations: `ollama/`, `openai/`, `anthropic/`. All providers must implement this interface. The `openai/` implementation should be OpenAI-compatible (covers Ollama's `/v1` endpoint too, with configuration).

**Prompt structure for Explain**:
1. High-level intuition
2. Purpose in this system
3. How it works (major steps)
4. Dependencies (what it calls, what calls it)
5. Code-level detail

The prompt must include: the node's source code, its kind + name + package, its immediate neighbors from the subgraph.

---

## UI Architecture

Built with **Vite + React + TypeScript**. Do not use Create React App.

Key libraries:
- `reactflow` — graph canvas, handles zoom/pan/select/drag natively
- `react-query` or `swr` — data fetching from the Go API
- `zustand` — lightweight global state (selected node, current depth level, filters)

**Component responsibilities**:

| Component | Responsibility |
|---|---|
| `Canvas.tsx` | Renders the React Flow graph. Handles node click → selection. Applies layout (use `dagre` for automatic layout). Handles hierarchical drill-down by filtering displayed nodes. |
| `HierarchyPanel.tsx` | Left sidebar. Tree view of the codebase (packages → files → functions). Clicking an item selects it and focuses the canvas. |
| `ExplanationPanel.tsx` | Right sidebar. Shows layered AI explanation for the selected node. Calls `POST /api/explain`. Expandable sections per layer. |
| `useGraph.ts` | Fetches full graph on mount. Manages selected node state. Computes the visible subgraph based on current drill-down level. |

**Hierarchical drill-down logic** (implement in `useGraph.ts`):
- Level 0: show only package nodes + import edges
- Level 1 (click package): show files within that package + edges between them
- Level 2 (click file): show functions/types within that file + call edges
- Level 3 (click function): show that function + its direct neighbors (callers + callees + types used)
- Nodes outside current context fade (opacity 0.2) or are hidden depending on graph size

---

## CLI Flags

```
codeatlas [path] [flags]

Flags:
  --port            int     Local server port (default: 5555)
  --llm-provider    string  LLM provider: ollama | openai | anthropic (default: ollama)
  --llm-model       string  Model name (default: provider-dependent)
  --llm-key         string  API key (or read from env: CODEATLAS_LLM_KEY)
  --no-open         bool    Don't auto-open browser
  --cache           bool    Cache analysis to .codeatlas-cache/ (default: true)
  --verbose         bool    Verbose logging
```

Config file (`codeatlas.config.json`) in repo root takes lower priority than flags. Flag > config file > defaults.

---

## Key Conventions

### Go

- Standard library first. Add dependencies only when the stdlib genuinely cannot do the job.
- Use `context.Context` for all LLM and HTTP calls.
- All errors must be wrapped: `fmt.Errorf("analyzing package %s: %w", pkg, err)`.
- No global state. Pass dependencies explicitly (dependency injection via structs).
- The analyzer is the most complex component — test it with fixture repos in `testdata/`.

### TypeScript / React

- Functional components only. No class components.
- All API types must be generated from or manually mirrored from the Go types in `graph/graph.go`. Keep them in sync.
- Do not use `any`. Use proper types everywhere.
- CSS Modules or a single `index.css` design system — no inline styles except for dynamic values (e.g., React Flow node positions).

### Git

- Commits follow Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.
- No generated files (`ui/dist/`, `.codeatlas-cache/`) in version control.

---

## What NOT to Do

- Do not add runtime code execution to the analyzer. Analysis must be purely static.
- Do not make the server require a database. All state is in-memory (or the cache file).
- Do not break the `Analyzer` interface contract — it's the extension point for community language contributions.
- Do not add LLM calls to the critical path (analysis + graph load). The AI sidebar is on-demand only.
- Do not bundle API keys or credentials anywhere in the codebase.
- Do not ignore context cancellation in long-running operations (analysis, LLM calls).

---

## Testing Approach

| Layer | Strategy |
|---|---|
| `graph/` | Unit tests — pure data structures, test construction and serialization |
| `analyzer/golang/` | Integration tests against `testdata/` fixture repos |
| `server/` | HTTP handler tests using `httptest.NewRecorder` |
| `llm/` | Mock the `LLMClient` interface for all tests that depend on it |
| UI | Component tests with Vitest + React Testing Library for critical paths |

Run all Go tests: `go test ./...`
Run UI tests: `cd ui && npm test`

---

## Caching

Analysis results are cached to `.codeatlas-cache/graph.json` in the repo root (gitignored). On subsequent runs, if the cache file is newer than any source file in the repo, skip re-analysis. If `--cache=false` is passed, always re-analyze.

---

## Embedding the UI

The UI must be built before the Go binary is compiled. The Makefile handles this:

```makefile
build:
    cd ui && npm install && npm run build
    go build -o codeatlas ./cmd/codeatlas
```

The `ui/dist` directory is embedded into the binary using `//go:embed ui/dist`. If `ui/dist` is missing, `go build` will fail — this is intentional.

---

## Questions to Ask Before Making Changes

1. Does this change the `graph.Graph` schema? → Update both Go types and TypeScript types.
2. Does this change an API route? → Update handlers, UI hooks, and this document.
3. Does this change the `Analyzer` interface? → That's almost certainly wrong. The interface is frozen by design.
4. Does this add a new dependency? → Justify it. Prefer stdlib.
5. Does this touch LLM prompting? → Test the output quality, not just that it returns a string.
