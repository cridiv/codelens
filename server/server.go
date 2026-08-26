package server

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/cridiv/codelens/graph"
	"github.com/cridiv/codelens/llm"
)

// UIFiles is the embedded UI build output.
// The go:embed directive is applied in the binary entrypoint (cmd/codeatlas)
// because embed paths must be relative to the file that declares them.
// Callers provide the FS via New().
var UIFiles embed.FS

// Server wraps an HTTP server with all its dependencies.
type Server struct {
	graph    *graph.Graph
	llm      llm.LLMClient // may be nil when no provider is configured
	httpSrv  *http.Server
	uiFiles  fs.FS
	verbose  bool
}

// Options configures a Server instance.
type Options struct {
	Port    int
	Graph   *graph.Graph
	LLM     llm.LLMClient // optional
	UIFiles fs.FS         // embedded ui/dist — pass nil to skip UI serving
	Verbose bool
}

// New creates a configured Server and registers all routes.
func New(opts Options) *Server {
	s := &Server{
		graph:   opts.Graph,
		llm:     opts.LLM,
		uiFiles: opts.UIFiles,
		verbose: opts.Verbose,
	}

	mux := http.NewServeMux()

	// ── REST API ──────────────────────────────────────────────────────────────
	mux.HandleFunc("/api/graph", s.handleGraph)
	mux.HandleFunc("/api/node/", s.handleNode) // matches /api/node/:id and /api/node/:id/neighbors
	mux.HandleFunc("/api/explain", s.handleExplain)

	// ── Static UI ─────────────────────────────────────────────────────────────
	if opts.UIFiles != nil {
		// Serve ui/dist contents at /; strip the "ui/dist" prefix so that
		// index.html is accessible at "/" rather than "/ui/dist/index.html".
		stripped, err := fs.Sub(opts.UIFiles, "ui/dist")
		if err != nil {
			log.Printf("[server] warn: could not strip ui/dist prefix: %v", err)
		} else {
			uiHandler := http.FileServer(http.FS(stripped))
			// Only intercept non-API routes.
			mux.Handle("/", uiHandler)
		}
	}

	s.httpSrv = &http.Server{
		Addr:         fmt.Sprintf(":%d", opts.Port),
		Handler:      loggingMiddleware(opts.Verbose, corsMiddleware(mux)),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second, // generous — LLM calls can be slow
		IdleTimeout:  120 * time.Second,
	}

	return s
}

// ServeHTTP implements http.Handler, allowing the Server to be used directly
// in tests with httptest.NewRecorder without binding to a real port.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.httpSrv.Handler.ServeHTTP(w, r)
}

// Start begins listening. It blocks until the context is cancelled.
func (s *Server) Start(ctx context.Context) error {
	ln, err := net.Listen("tcp", s.httpSrv.Addr)
	if err != nil {
		return fmt.Errorf("binding to %s: %w", s.httpSrv.Addr, err)
	}

	log.Printf("[server] listening on http://localhost%s", s.httpSrv.Addr)

	errCh := make(chan error, 1)
	go func() {
		if err := s.httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return s.httpSrv.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}

// loggingMiddleware logs every request when verbose is true.
func loggingMiddleware(verbose bool, next http.Handler) http.Handler {
	if !verbose {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("[server] %s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

// corsMiddleware adds permissive CORS headers for local development.
// The UI dev server runs on a different port from the Go server, so these
// are required during development. In production the Go server also serves
// the UI, making CORS irrelevant, but the headers are harmless.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
