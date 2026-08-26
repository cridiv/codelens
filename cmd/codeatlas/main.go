package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	goanalyzer "github.com/cridiv/codelens/analyzer/golang"
	"github.com/cridiv/codelens/graph"
	llmopenai "github.com/cridiv/codelens/llm/openai"
	"github.com/cridiv/codelens/server"
	uiembed "github.com/cridiv/codelens"
)

// cacheFileName is written inside the analysed repo root.
const cacheFileName = ".codeatlas-cache/graph.json"

func main() {
	// ── Flags ──────────────────────────────────────────────────────────────────
	port := flag.Int("port", 5555, "Local server port")
	noOpen := flag.Bool("no-open", false, "Don't auto-open browser after starting")
	useCache := flag.Bool("cache", true, "Cache analysis to .codeatlas-cache/graph.json")
	invalidateCache := flag.Bool("invalidate-cache", false, "Force re-analysis even if cache is valid")
	verbose := flag.Bool("verbose", false, "Verbose request logging")

	llmProvider := flag.String("llm-provider", "nvidia-nim", "LLM provider: nvidia-nim | openai | ollama | none")
	llmModel := flag.String("llm-model", "", "Model name (default: deepseek-ai/deepseek-r1 for nvidia-nim)")
	llmKey := flag.String("llm-key", "", "API key (falls back to MODEL_API_KEY env var)")
	llmBaseURL := flag.String("llm-base-url", "", "Override LLM base URL (optional)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: codeatlas [path] [flags]\n\n")
		fmt.Fprintf(os.Stderr, "  path  Repository to analyse (default: current directory)\n\n")
		fmt.Fprintf(os.Stderr, "Flags:\n")
		flag.PrintDefaults()
	}

	flag.Parse()

	// ── Resolve target path ────────────────────────────────────────────────────
	repoPath := "."
	if flag.NArg() > 0 {
		repoPath = flag.Arg(0)
	}

	absRepoPath, err := filepath.Abs(repoPath)
	if err != nil {
		log.Fatalf("resolving path %q: %v", repoPath, err)
	}

	// ── Load or build graph ────────────────────────────────────────────────────
	cacheValid := *useCache && !*invalidateCache
	g, err := loadGraph(absRepoPath, cacheValid, *verbose)
	if err != nil {
		log.Fatalf("analysis failed: %v", err)
	}

	// ── Configure LLM ─────────────────────────────────────────────────────────
	apiKey := findAPIKey(*llmKey, absRepoPath)

	modelName := *llmModel
	if modelName == "" {
		modelName = os.Getenv("MODEL_NAME")
	}

	llmClient := buildLLMClient(*llmProvider, modelName, *llmBaseURL, apiKey, *verbose)

	// ── Embed UI ───────────────────────────────────────────────────────────────
	// Strip the "ui/dist" prefix so that index.html is at "/" not "/ui/dist/".
	uiFS, err := fs.Sub(uiembed.FS, "ui/dist")
	if err != nil {
		log.Printf("[embed] could not sub ui/dist: %v — UI will not be served", err)
		uiFS = nil
	}

	// ── Start server ───────────────────────────────────────────────────────────
	opts := server.Options{
		Port:     *port,
		Graph:    g,
		LLM:      llmClient,
		UIFiles:  uiFS,
		RepoPath: absRepoPath,
		Verbose:  *verbose,
	}

	srv := server.New(opts)

	if !*noOpen {
		go func() {
			time.Sleep(400 * time.Millisecond)
			openBrowser(fmt.Sprintf("http://localhost:%d", *port))
		}()
	}

	// ── Graceful shutdown ──────────────────────────────────────────────────────
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	fmt.Printf("╭─────────────────────────────────────────╮\n")
	fmt.Printf("│  CodeLens — Don't just read. Explore.   │\n")
	fmt.Printf("├─────────────────────────────────────────┤\n")
	fmt.Printf("│  Nodes : %-5d   Edges : %-5d           │\n", len(g.Nodes), len(g.Edges))
	fmt.Printf("│  URL   : http://localhost:%-5d           │\n", *port)
	fmt.Printf("╰─────────────────────────────────────────╯\n")

	if err := srv.Start(ctx); err != nil {
		log.Fatalf("server error: %v", err)
	}

	log.Println("CodeLens — shut down cleanly")
}

// buildLLMClient selects and constructs an LLM client based on the provider flag.
func buildLLMClient(provider, model, baseURL, apiKey string, verbose bool) *llmopenai.Client {
	switch provider {
	case "none", "":
		if verbose {
			log.Println("[llm] no provider configured — /api/explain will return 503")
		}
		return nil
	case "nvidia-nim":
		if apiKey == "" {
			log.Println("[llm] warn: nvidia-nim selected but MODEL_API_KEY is not set — /api/explain will fail")
		}
		if model == "" {
			model = llmopenai.DefaultModel
		}
		if baseURL == "" {
			baseURL = llmopenai.NVIDIANIMBaseURL
		}
		if verbose {
			log.Printf("[llm] nvidia-nim: model=%s base=%s", model, baseURL)
		}
		return llmopenai.New(llmopenai.Options{
			BaseURL: baseURL,
			APIKey:  apiKey,
			Model:   model,
		})
	case "openai":
		if baseURL == "" {
			baseURL = "https://api.openai.com/v1"
		}
		if model == "" {
			model = "gpt-4o"
		}
		if verbose {
			log.Printf("[llm] openai: model=%s", model)
		}
		return llmopenai.New(llmopenai.Options{
			BaseURL: baseURL,
			APIKey:  apiKey,
			Model:   model,
		})
	case "ollama":
		if baseURL == "" {
			baseURL = "http://localhost:11434/v1"
		}
		if model == "" {
			model = "codellama"
		}
		if verbose {
			log.Printf("[llm] ollama: model=%s base=%s", model, baseURL)
		}
		return llmopenai.New(llmopenai.Options{
			BaseURL: baseURL,
			APIKey:  "ollama", // Ollama ignores the key but the header is required
			Model:   model,
		})
	default:
		log.Printf("[llm] unknown provider %q — treating as none", provider)
		return nil
	}
}

// loadGraph either reads a valid cache or re-runs the analyzer.
func loadGraph(absRepoPath string, useCache bool, verbose bool) (*graph.Graph, error) {
	cacheFile := filepath.Join(absRepoPath, cacheFileName)

	if useCache {
		if g, ok := tryReadCache(cacheFile, absRepoPath, verbose); ok {
			return g, nil
		}
	}

	if verbose {
		log.Printf("[analyzer] scanning %s …", absRepoPath)
	}

	start := time.Now()
	az := goanalyzer.New()
	g, err := az.Analyze(absRepoPath)
	if err != nil {
		return nil, fmt.Errorf("analyzing %s: %w", absRepoPath, err)
	}

	log.Printf("[analyzer] done in %s — %d nodes, %d edges",
		time.Since(start).Round(time.Millisecond), len(g.Nodes), len(g.Edges))

	if useCache {
		if err := writeCache(cacheFile, g); err != nil && verbose {
			log.Printf("[cache] write failed: %v", err)
		}
	}

	return g, nil
}

// tryReadCache returns the cached graph if the cache file is newer than any
// .go source file in the repo. Returns (nil, false) on any miss or error.
func tryReadCache(cacheFile, repoPath string, verbose bool) (*graph.Graph, bool) {
	cacheStat, err := os.Stat(cacheFile)
	if err != nil {
		return nil, false
	}

	var newestSrc time.Time
	_ = filepath.WalkDir(repoPath, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if filepath.Ext(path) != ".go" {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		if info.ModTime().After(newestSrc) {
			newestSrc = info.ModTime()
		}
		return nil
	})

	if newestSrc.After(cacheStat.ModTime()) {
		if verbose {
			log.Printf("[cache] stale — source changed after cache was written")
		}
		return nil, false
	}

	data, err := os.ReadFile(cacheFile)
	if err != nil {
		return nil, false
	}

	var g graph.Graph
	if err := json.Unmarshal(data, &g); err != nil {
		if verbose {
			log.Printf("[cache] corrupt, re-analyzing: %v", err)
		}
		return nil, false
	}

	if verbose {
		log.Printf("[cache] loaded from %s", cacheFile)
	}
	return &g, true
}

// writeCache serialises the graph to the cache file, creating parent dirs.
func writeCache(cacheFile string, g *graph.Graph) error {
	if err := os.MkdirAll(filepath.Dir(cacheFile), 0o755); err != nil {
		return fmt.Errorf("creating cache dir: %w", err)
	}
	data, err := json.MarshalIndent(g, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding graph: %w", err)
	}
	if err := os.WriteFile(cacheFile, data, 0o644); err != nil {
		return fmt.Errorf("writing cache file: %w", err)
	}
	return nil
}

// findAPIKey retrieves the API key with fallback precedence:
// 1. Explicit CLI flag
// 2. Process environment variables (MODEL_API_KEY, CODEATLAS_LLM_KEY, NVIDIA_API_KEY, OPENAI_API_KEY)
// 3. .env file in the target repository directory
// 4. .env file in the current working directory
func findAPIKey(flagKey, repoPath string) string {
	if flagKey != "" {
		return flagKey
	}

	envVars := []string{"MODEL_API_KEY", "CODEATLAS_LLM_KEY", "NVIDIA_API_KEY", "OPENAI_API_KEY"}
	for _, envName := range envVars {
		if val := os.Getenv(envName); val != "" {
			return val
		}
	}

	// Try reading .env files
	envLocations := []string{
		filepath.Join(repoPath, ".env"),
		".env",
	}

	for _, loc := range envLocations {
		data, err := os.ReadFile(loc)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, "\"'`")

			for _, targetKey := range envVars {
				if key == targetKey && val != "" {
					return val
				}
			}
		}
	}

	return ""
}

