# CodeLens — Implementation Plan

> **Tagline**: Don't just read the codebase. Explore it.

This document sequences the full build of CodeLens from zero to a shippable open-source tool. Stages are ordered by dependency — each stage's output is the foundation for the next. Do not skip or reorder stages.

---

## Stage Overview

| # | Stage | Output | Gate |
|---|---|---|---|
| 1 | Project Scaffold | Go module + Vite app wired together | `go build` passes; `npm run dev` runs |
| 2 | Graph Types | Shared `graph.Graph` model + serialization | Types compile; JSON round-trip test passes |
| 3 | Go Analyzer | Static analysis of a Go repo | Produces valid graph from a real repo |
| 4 | HTTP Server | Local server serving graph API | All API routes respond correctly |
| 5 | UI Foundation | React app with design system | Renders in browser, fetches graph |
| 6 | Canvas (Graph View) | Interactive React Flow canvas | Can zoom, pan, select nodes |
| 7 | Hierarchical Drill-down | Level-based graph exploration | Click package → files → functions |
| 8 | Hierarchy Panel | Left sidebar tree view | Tree syncs with canvas selection |
| 9 | LLM Integration | AI explanation sidebar | Clicking a node produces an explanation |
| 10 | CLI Polish | Flags, config file, auto-open browser | `codeatlas .` works end-to-end |
| 11 | Caching | Cache analysis to disk | Second run is significantly faster |
| 12 | Embedding + Single Binary | UI bundled into Go binary | `go build` produces one self-contained binary |
| 13 | Error Handling + Logging | Graceful errors throughout | No panics on malformed input |
| 14 | Testing | Full test suite | `go test ./...` + `npm test` pass |
| 15 | README + Release | Public GitHub repo | Anyone can install and run it |

---

## Stage 1 — Project Scaffold

**Goal**: A compiling Go module and a running Vite/React app, with a Makefile that builds both.

### Tasks

1. Initialize Go module:
   ```bash
   go mod init github.com/[username]/codelens
   ```

2. Create the directory structure as defined in `AGENTS.md`.

3. Create `cmd/codeatlas/main.go` with a stub `main()` that prints `"CodeLens — starting..."` and exits.

4. Initialize the UI:
   ```bash
   cd ui && npm create vite@latest . -- --template react-ts
   ```

5. Write a `Makefile`:
   ```makefile
   .PHONY: build ui run

   ui:
       cd ui && npm install && npm run build

   build: ui
       go build -o codeatlas ./cmd/codeatlas

   run:
       go run ./cmd/codeatlas .
   ```

6. Add `.gitignore` entries: `ui/dist/`, `.codeatlas-cache/`, `codeatlas` (binary), `codeatlas.config.json`.

**Gate**: `go build ./...` succeeds. `cd ui && npm run dev` opens Vite's default page.

---

## Stage 2 — Graph Types

**Goal**: Define the shared data model that all layers will communicate through.

### Tasks

1. Implement `graph/graph.go`:
   - `Node` struct: `ID`, `Kind`, `Name`, `Path`, `Metadata map[string]string`
   - `Edge` struct: `From`, `To`, `Kind`
   - `Graph` struct: `Nodes []Node`, `Edges []Edge`
   - Helper: `Graph.NodeByID(id string) (Node, bool)`
   - Helper: `Graph.NeighborsOf(id string) Graph` — returns one-hop subgraph

2. Write `graph/graph_test.go`:
   - Test JSON marshaling/unmarshaling round-trip
   - Test `NodeByID` with known and unknown IDs
   - Test `NeighborsOf` with a small hand-constructed graph

3. Mirror the types in `ui/src/types/graph.ts`:
   ```typescript
   export interface Node {
     id: string;
     kind: 'package' | 'file' | 'function' | 'type';
     name: string;
     path: string;
     metadata: Record<string, string>;
   }
   export interface Edge { from: string; to: string; kind: string; }
   export interface Graph { nodes: Node[]; edges: Edge[]; }
   ```

**Gate**: `go test ./graph/...` passes.

---

## Stage 3 — Go Analyzer

**Goal**: Given a path to a Go repository, produce a populated `graph.Graph`.

### Tasks

1. Define the interface in `analyzer/analyzer.go`:
   ```go
   type Analyzer interface {
       Analyze(repoPath string) (*graph.Graph, error)
   }
   ```

2. Implement `analyzer/golang/analyzer.go` using `golang.org/x/tools/go/packages`:

   **Step A — Load packages**
   - Use `packages.Load` with `packages.NeedName | packages.NeedFiles | packages.NeedSyntax | packages.NeedTypes | packages.NeedTypesInfo | packages.NeedImports`
   - Walk all packages in the target module

   **Step B — Package nodes + import edges**
   - For each loaded package, create a `Node` with `Kind: "package"`
   - For each import, create an `Edge` with `Kind: "imports"`

   **Step C — File nodes + contains edges**
   - For each `.go` file in the package, create a `Node` with `Kind: "file"`
   - Add `Edge{Kind: "contains"}` from package → file

   **Step D — Function + type nodes**
   - Walk each file's AST with `ast.Inspect`
   - For each `*ast.FuncDecl`: create `Node{Kind: "function"}`, populate `Metadata["signature"]`
   - For each `*ast.TypeSpec` (struct, interface): create `Node{Kind: "type"}`
   - Add `contains` edges: file → function, file → type

   **Step E — Call edges**
   - Use `TypesInfo.Uses` to resolve `*ast.CallExpr` → `*types.Func`
   - For each resolved call, add `Edge{Kind: "calls"}` from calling function to called function
   - Handle both intra-package and cross-package calls

   **Step F — Interface implementation edges**
   - For each struct type, use `types.Implements` to check against all interface types
   - Add `Edge{Kind: "implements"}` for each satisfied interface

3. Create `testdata/simple/` — a minimal Go module with 2–3 packages, some function calls, and one interface implementation. Use this as the integration test fixture.

4. Write `analyzer/golang/analyzer_test.go`:
   - Parse `testdata/simple/`
   - Assert expected node count and kinds
   - Assert expected call edge exists
   - Assert expected implements edge exists

**Gate**: `go test ./analyzer/...` passes against `testdata/simple/`. Running the analyzer against the CodeLens repo itself produces a non-empty graph.

---

## Stage 4 — HTTP Server

**Goal**: A local HTTP server that runs the analyzer and serves the graph via REST API.

### Tasks

1. Add `github.com/go-chi/chi/v5` to `go.mod` (lightweight router).

2. Implement `server/server.go`:
   - `Server` struct holding: `graph *graph.Graph`, `llm llm.LLMClient`, `port int`
   - `NewServer(g *graph.Graph, llm llm.LLMClient, port int) *Server`
   - `Server.Start() error` — registers routes, starts `http.ListenAndServe`

3. Implement `server/handlers.go`:

   | Route | Handler |
   |---|---|
   | `GET /api/graph` | Return full `graph.Graph` as JSON |
   | `GET /api/node/{id}` | Return `graph.Node` by ID or 404 |
   | `GET /api/node/{id}/neighbors` | Return one-hop subgraph as JSON |
   | `POST /api/explain` | Decode `{nodeId}`, call `llm.Explain`, return `{explanation}` |
   | `GET /*` | Serve embedded UI (added in Stage 12; stub for now) |

4. Wire the server into `cmd/codeatlas/main.go`:
   - Call the Go analyzer on the provided path
   - Create a stub `LLMClient` that returns `"LLM not configured"` for now
   - Start the server

5. Write `server/handlers_test.go` using `httptest.NewRecorder`:
   - Test each route returns correct status codes and JSON shape
   - Test 404 on unknown node ID

**Gate**: `curl localhost:5555/api/graph` returns a JSON object with `nodes` and `edges` arrays.

---

## Stage 5 — UI Foundation

**Goal**: The React app renders, connects to the Go server, and displays a node count.

### Tasks

1. Install core UI dependencies:
   ```bash
   cd ui && npm install reactflow @tanstack/react-query zustand dagre @types/dagre
   ```

2. Create `ui/src/types/graph.ts` (from Stage 2).

3. Implement `ui/src/hooks/useGraph.ts`:
   - Fetch `GET /api/graph` on mount using React Query
   - Expose: `graph`, `isLoading`, `error`, `selectedNode`, `setSelectedNode`

4. Create `ui/src/store.ts` using Zustand:
   - State: `selectedNodeId: string | null`, `drillLevel: number`, `focusPackage: string | null`
   - Actions: `selectNode`, `drillInto`, `resetDrill`

5. Create a minimal `ui/src/index.css` design system:
   - CSS variables for colors, spacing, typography (dark theme as default)
   - Font: `Inter` from Google Fonts
   - Layout: three-column (sidebar / canvas / panel) using CSS Grid

6. Implement `ui/src/App.tsx`:
   - Three-panel layout: `HierarchyPanel` | `Canvas` | `ExplanationPanel`
   - Wrap in `QueryClientProvider`
   - Show loading spinner while graph is fetching
   - Show node count in a top bar once loaded

**Gate**: `npm run dev` proxying to the Go server renders a page showing the node count.

---

## Stage 6 — Canvas (Graph View)

**Goal**: An interactive React Flow canvas rendering all graph nodes with zoom, pan, and click-to-select.

### Tasks

1. Implement `ui/src/components/Canvas.tsx`:
   - Use `ReactFlow` component
   - Convert `graph.Node[]` → `ReactFlow.Node[]`:
     - Apply `dagre` auto-layout (`rankdir: 'LR'` for packages, `'TB'` for files/functions)
     - Style nodes by `Kind`: packages are larger, functions are smaller; distinct colors per kind
   - Convert `graph.Edge[]` → `ReactFlow.Edge[]`
   - On node click: call `store.selectNode(node.id)`
   - Include `MiniMap`, `Controls`, `Background` from React Flow

2. Create custom node components per kind:
   - `PackageNode` — bold name, package icon, import count badge
   - `FileNode` — filename, function count badge
   - `FunctionNode` — function name + signature preview
   - `TypeNode` — type name + struct/interface indicator

3. Connect canvas to Zustand store:
   - Highlight selected node (ring/glow)
   - Fade unrelated nodes when a node is selected (opacity transition)

**Gate**: Canvas renders a real graph. Clicking a node highlights it. Zoom and pan work.

---

## Stage 7 — Hierarchical Drill-down

**Goal**: The canvas renders only the contextually relevant subgraph based on drill level.

### Tasks

1. Implement drill-down logic in `useGraph.ts` (or a separate `useVisibleGraph.ts`):

   | Drill Level | Visible Nodes | Visible Edges |
   |---|---|---|
   | 0 (default) | All packages | `imports` edges only |
   | 1 (package selected) | Files within selected package + neighboring packages | `imports` + `contains` |
   | 2 (file selected) | Functions/types within selected file + direct cross-file dependencies | `calls` + `contains` |
   | 3 (function selected) | Selected function + 1-hop neighbors (callers, callees, used types) | All edge kinds |

2. Add animated transitions:
   - When drilling in: new nodes fade in; irrelevant nodes fade out then are removed
   - Use React Flow's `fitView` after each drill-level change

3. Add a breadcrumb in the top bar: `repo > auth > login.go > authenticateUser`
   - Each crumb is clickable to drill back up to that level

4. Add a "Reset View" button that returns to Level 0.

**Gate**: Clicking a package zooms into its files. Clicking a function shows only its local graph.

---

## Stage 8 — Hierarchy Panel

**Goal**: A left sidebar with a collapsible tree view of the entire codebase structure.

### Tasks

1. Implement `ui/src/components/HierarchyPanel.tsx`:
   - Tree structure: packages → files → functions/types
   - Built from the full `graph.Graph` (not the filtered visible graph)
   - Each item is clickable — clicking calls `store.selectNode` and triggers the appropriate drill level
   - Current selection is highlighted
   - Packages and files are collapsible; default: packages expanded, files collapsed

2. Add a search input at the top of the panel:
   - Filters the tree in real-time by name
   - Matches are highlighted in the filtered results

3. Sync panel with canvas:
   - When a node is selected from the canvas, scroll the panel to that node and highlight it
   - Use a `ref` + `scrollIntoView` for this

**Gate**: Clicking any item in the tree focuses and selects that node in the canvas.

---

## Stage 9 — LLM Integration

**Goal**: Selecting a node triggers an AI explanation in the right sidebar.

### Tasks

1. Define the LLM interface in `llm/llm.go`:
   ```go
   type LLMClient interface {
       Explain(ctx context.Context, node graph.Node, subgraph graph.Graph, sourceCode string) (string, error)
   }
   ```

2. Implement `llm/ollama/client.go`:
   - POST to `http://localhost:11434/api/generate`
   - Model configurable (default: `codellama` or `llama3`)
   - Stream response is optional for Phase 1 — full response is fine

3. Implement `llm/openai/client.go`:
   - POST to `https://api.openai.com/v1/chat/completions` (or any compatible base URL)
   - Used for OpenAI, Anthropic (via their OpenAI-compatible endpoint), and self-hosted models

4. Build the prompt in `llm/prompt.go`:
   ```
   You are an expert software engineer analyzing a Go codebase.
   
   Explain the following component in this structured format:
   1. High-level intuition — what is this trying to accomplish?
   2. Purpose — why does it exist in this system?
   3. How it works — what are the major steps?
   4. Dependencies — what does it call, what calls it?
   5. Code-level detail — what do the important blocks mean?
   
   Component: {kind} {name} in package {package}
   
   Source code:
   {sourceCode}
   
   Graph context (neighbors):
   {neighborsJSON}
   ```

5. Implement `ui/src/components/ExplanationPanel.tsx`:
   - Opens when a node is selected
   - Shows node name, kind, and path at the top
   - Calls `POST /api/explain` via React Query mutation
   - Displays the explanation in five collapsible sections (one per prompt layer)
   - Shows a loading skeleton while waiting
   - Shows "No LLM configured" gracefully if explain returns an error

6. Source code retrieval: the `GET /api/node/:id` response should include a `sourceCode` field (read from disk at request time using the node's `Path` + position metadata).

**Gate**: Clicking a function node produces a structured AI explanation in the right sidebar. Works with Ollama locally.

---

## Stage 10 — CLI Polish

**Goal**: `codeatlas [path] [flags]` is a complete, user-friendly CLI.

### Tasks

1. Replace the stub `main.go` with a full implementation using `flag` (stdlib) or `github.com/spf13/cobra`:
   - Parse: `path`, `--port`, `--llm-provider`, `--llm-model`, `--llm-key`, `--no-open`, `--cache`, `--verbose`
   - Print a startup banner with the detected language and port

2. Implement config file loading (`codeatlas.config.json`):
   - Load from repo root if present
   - Flags override config; config overrides defaults

3. Auto-open browser:
   - After server starts, call `open http://localhost:{port}` (macOS), `xdg-open` (Linux), `start` (Windows)
   - Skip if `--no-open` is set

4. Add `--verbose` mode:
   - Log each analysis step (packages found, nodes created, edges added)
   - Log each API request

5. Print helpful errors:
   - If no Go files found: `"No Go files found in {path}. Make sure you're pointing at a Go module."`
   - If port is in use: `"Port {port} is already in use. Try --port {port+1}."`
   - If LLM is unreachable: warn but don't fail — explain sidebar will show an error instead

**Gate**: `codeatlas .` (run from any Go repo) analyzes, starts server, and opens browser.

---

## Stage 11 — Caching

**Goal**: Second and subsequent runs are near-instant for large repos.

### Tasks

1. After a successful analysis, serialize `graph.Graph` to `.codeatlas-cache/graph.json`.

2. On startup, check if cache exists and is valid:
   - Cache is valid if `graph.json` modified time is newer than the newest `.go` file in the repo
   - If valid: load from cache, skip analysis
   - If invalid or `--cache=false`: run analysis, overwrite cache

3. Add a `--invalidate-cache` flag to force re-analysis.

4. The cache directory is `.codeatlas-cache/` in the repo root. Add it to the repo's `.gitignore` (print a warning if it's not).

**Gate**: Running `codeatlas .` twice on a large repo: first run takes N seconds, second run takes <1 second.

---

## Stage 12 — Embedding + Single Binary

**Goal**: The final artifact is one self-contained binary. No separate UI directory required.

### Tasks

1. In `server/server.go`, add:
   ```go
   //go:embed ui/dist
   var uiFiles embed.FS
   ```
   Note: this path is relative to the Go file — the `ui/dist` directory must exist at build time.

2. Serve the embedded UI from the catch-all route (`GET /*`):
   ```go
   http.FileServer(http.FS(uiFiles))
   ```
   
3. Update the Makefile to always build the UI before the Go binary:
   ```makefile
   build: ui
       go build -o codeatlas ./cmd/codeatlas
   ```

4. Verify the binary works without the `ui/` directory present on disk.

5. Set up `goreleaser` for multi-platform builds:
   - Targets: `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, `windows/amd64`
   - Output: GitHub Releases with attached binaries

**Gate**: A single `./codeatlas` binary serves the UI correctly when `ui/` is deleted from the working directory.

---

## Stage 13 — Error Handling + Logging

**Goal**: The tool handles all failure modes gracefully. No panics, no silent failures.

### Tasks

1. Add `log/slog` structured logging throughout:
   - Analysis progress
   - Server requests (method, path, duration)
   - LLM call duration and token counts (if available)

2. Wrap all errors with context using `fmt.Errorf("... %w", err)`.

3. The analyzer must handle:
   - Repos with build errors (analyze what can be analyzed, log what failed)
   - Missing `go.mod` (return a clear error)
   - Empty directories

4. The server must handle:
   - Malformed JSON in POST body (400)
   - Node ID not found (404)
   - LLM timeout (503 with `Retry-After` header)
   - Panics in handlers (recover middleware → 500)

5. The UI must handle:
   - API fetch failures (error banner, retry button)
   - Empty graph (friendly empty state: "No nodes found — is this a Go module?")
   - LLM explain failure (show error in explanation panel, don't crash)

**Gate**: Point CodeLens at a non-Go directory, a broken repo, and a valid repo with the LLM offline. All three produce useful output, not panics.

---

## Stage 14 — Testing

**Goal**: A comprehensive test suite that can catch regressions.

### Tasks

**Go tests**:
1. `graph/graph_test.go` — type construction, serialization, helpers
2. `analyzer/golang/analyzer_test.go` — fixture repo analysis (assert exact node/edge counts)
3. `server/handlers_test.go` — all API routes with mock graph + mock LLM
4. `llm/prompt_test.go` — prompt construction from known inputs
5. `cmd/codeatlas/main_test.go` — flag parsing and config loading

**UI tests** (Vitest + React Testing Library):
1. `useGraph.test.ts` — mock API, test drill-down logic
2. `HierarchyPanel.test.tsx` — renders tree, click selects node
3. `ExplanationPanel.test.tsx` — shows loading state, shows result, handles error
4. `Canvas.test.tsx` — renders nodes, handles empty graph

**Integration test**:
- `scripts/integration_test.sh` — starts the full stack against `testdata/simple/`, curls all API endpoints, asserts correct responses

**Gate**: `go test ./...` passes. `npm test` passes. Integration script exits 0.

---

## Stage 15 — README + Release

**Goal**: A public GitHub repo that any developer can install and use in under two minutes.

### Tasks

1. Write `README.md`:
   - What it is (one paragraph)
   - Screenshot or GIF of the UI
   - Installation (Homebrew, direct binary download, build from source)
   - Quick start: `codeatlas .`
   - Configuration reference (all flags + config file schema)
   - How to add a language analyzer (contribution guide stub)
   - License

2. Create `CONTRIBUTING.md`:
   - How to set up the dev environment
   - How to run tests
   - How to implement a new language analyzer (step-by-step with the interface contract)

3. Set up GitHub Actions:
   - CI: run `go test ./...` + `npm test` on every PR
   - Release: run `goreleaser` on every tag push
   - Lint: `golangci-lint` + `eslint`

4. Create a Homebrew formula in a separate `homebrew-codelens` repo (optional for initial release, required for wide adoption).

5. Tag `v0.1.0` and publish the release.

**Gate**: A fresh clone + `brew install codelens` (or binary download) + `codeatlas .` works on a real Go project with zero configuration.

---

## Dependency Reference

### Go
| Package | Purpose |
|---|---|
| `golang.org/x/tools/go/packages` | Load Go packages with type info |
| `github.com/go-chi/chi/v5` | HTTP router |
| `github.com/spf13/cobra` | CLI flag parsing (optional — stdlib `flag` is fine for Phase 1) |

### Node / UI
| Package | Purpose |
|---|---|
| `reactflow` | Interactive graph canvas |
| `@tanstack/react-query` | Server state + data fetching |
| `zustand` | Client-side state |
| `dagre` | Automatic graph layout |

---

## Risk Log

| Risk | Likelihood | Mitigation |
|---|---|---|
| `go/packages` is slow on large repos | Medium | Caching (Stage 11) + parallelize package loading |
| React Flow perf degrades at >1000 nodes | Medium | Hierarchical drill-down means few nodes are ever visible at once |
| LLM latency makes explain feel slow | Low | Stream the response; show text as it arrives |
| Cross-package call resolution is complex | High | Use `TypesInfo.Uses` map from `go/types` — this is the correct approach |
| Interface satisfaction is O(n²) | Medium | Pre-compute once during analysis; not per-request |
