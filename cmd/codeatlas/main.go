package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	goanalyzer "github.com/cridiv/codelens/analyzer/golang"
	"github.com/cridiv/codelens/graph"
	"github.com/cridiv/codelens/server"
)

// cacheFileName is written inside the analysed repo root.
const cacheFileName = ".codeatlas-cache/graph.json"

func main() {
	// ── Flags ──────────────────────────────────────────────────────────────────
	port := flag.Int("port", 5555, "Local server port")
	noOpen := flag.Bool("no-open", false, "Don't auto-open browser after starting")
	useCache := flag.Bool("cache", true, "Cache analysis to .codeatlas-cache/graph.json")
	verbose := flag.Bool("verbose", false, "Verbose request logging")

	// LLM flags (implementations added in later phases)
	_ = flag.String("llm-provider", "ollama", "LLM provider: ollama | openai | anthropic")
	_ = flag.String("llm-model", "", "Model name (provider-dependent default if empty)")
	_ = flag.String("llm-key", "", "API key (falls back to CODEATLAS_LLM_KEY env var)")

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
	g, err := loadGraph(absRepoPath, *useCache, *verbose)
	if err != nil {
		log.Fatalf("analysis failed: %v", err)
	}

	// ── Start server ───────────────────────────────────────────────────────────
	opts := server.Options{
		Port:    *port,
		Graph:   g,
		LLM:     nil, // populated in a later phase when llm flags are wired
		UIFiles: nil, // populated once ui/dist is embedded (Makefile phase)
		Verbose: *verbose,
	}

	srv := server.New(opts)

	if !*noOpen {
		// Open the browser shortly after the server is up.
		go func() {
			time.Sleep(300 * time.Millisecond)
			openBrowser(fmt.Sprintf("http://localhost:%d", *port))
		}()
	}

	// ── Graceful shutdown ──────────────────────────────────────────────────────
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	fmt.Printf("CodeLens — analysed %d nodes, %d edges\n", len(g.Nodes), len(g.Edges))
	fmt.Printf("Open http://localhost:%d to explore your codebase.\n", *port)

	if err := srv.Start(ctx); err != nil {
		log.Fatalf("server error: %v", err)
	}

	log.Println("CodeLens — shut down cleanly")
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

	log.Printf("[analyzer] done in %s — %d nodes, %d edges", time.Since(start).Round(time.Millisecond), len(g.Nodes), len(g.Edges))

	if useCache {
		if err := writeCache(cacheFile, g); err != nil && verbose {
			log.Printf("[cache] write failed: %v", err)
		}
	}

	return g, nil
}

// tryReadCache returns the cached graph if the cache file is newer than any
// source file in the repo. Returns (nil, false) on any cache miss or error.
func tryReadCache(cacheFile, repoPath string, verbose bool) (*graph.Graph, bool) {
	cacheStat, err := os.Stat(cacheFile)
	if err != nil {
		return nil, false // no cache
	}

	// Walk repo to find the newest source file modification time.
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
