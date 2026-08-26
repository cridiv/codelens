# CodeLens

> **Don't just read the codebase. Explore it.**

CodeLens scans your codebase statically and renders its architecture as an interactive, visual map in your browser. Select any struct, interface, function, or package to get instant plain-English insights, relationship mappings, and AI-powered architectural breakdowns.

---

## ✨ Features

* **⚡ Instant Static Analysis**: Parses packages, structs, interfaces, methods, and call graphs in $< 1\text{s}$ without executing code.
* **🗺️ Interactive Architecture Map**: Smooth React Flow canvas with automatic layout, zoom/pan, and CodeOverview, Package, and File Schema view modes.
* **🔍 Instant Spec (0ms)**: Clicking any entity immediately shows:
  * **What it does** in plain English
  * **Why it exists**
  * **Inputs & Outputs** parameter breakdown
  * **What it connects to** (Inbound callers & Outbound dependencies)
* **🎓 "Teach Me with AI"**: On-demand architectural synthesis with Nemotron 120B structured into intuitive stages:
  * *1. The Big Idea (Metaphor & mental model)*
  * *2. Why It Exists*
  * *3. How It Works (Step-by-step)*
  * *4. Simple Toy Example*
* **💬 Interactive Follow-Up Q&A**: Ask questions directly underneath any component breakdown with full AST context.
* **💾 Local Caching**: Graph analysis and generated AI explanations are cached in `.codelens-cache/` for $0\text{ms}$ repeat loads.
* **📦 Single Standalone Binary**: The complete React UI is embedded into the Go binary using `//go:embed` — zero external runtime dependencies.

---

## 🚀 Quick Start

### 1. Build Single Binary
```bash
git clone https://github.com/cridiv/codelens.git
cd codelens
make build
```

### 2. Run on Any Codebase
```bash
# Analyze current directory
./codelens .

# Or point to any repository path on your machine
./codelens /path/to/my-project
```

CodeLens will analyze the AST and automatically launch `http://localhost:5555` in your default browser.

---

## 🔑 AI Configuration (Optional)

To enable on-demand **"Teach Me with AI"** and **Follow-Up Q&A**, set your API key in `.env` or pass it as a flag:

```bash
# In .env:
MODEL_API_KEY="your-api-key"
```

*Default model:* `nvidia/nemotron-3-super-120b-a12b` via NVIDIA NIM (also supports OpenAI and Ollama).

---

## 🛠️ CLI Options

```bash
codelens [path] [flags]

Flags:
  --port int              Local server port (default: 5555)
  --no-open               Don't auto-open browser after starting
  --cache                 Cache analysis to .codelens-cache/ (default: true)
  --invalidate-cache      Force re-analysis even if cache is valid
  --llm-provider string   LLM provider: nvidia-nim | openai | ollama (default: nvidia-nim)
  --llm-model string      Custom model name override
  --llm-key string        API key (or set in .env)
  --verbose               Verbose logging
```

---

## 🏗️ Architecture

```
codelens/
├── cmd/codelens/         # Single binary CLI entrypoint
├── analyzer/golang/      # Static Go AST & types parser
├── graph/                # Shared Node, Edge, and Graph data models
├── server/               # HTTP server, REST API, and embedded UI handler
├── llm/openai/           # OpenAI/NVIDIA NIM client with resilient HTTP transport
└── ui/                   # Vite + React + TypeScript + React Flow frontend
```

---

## 📄 License

MIT License.
