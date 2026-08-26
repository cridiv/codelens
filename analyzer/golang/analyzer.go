package golang

import (
	"fmt"
	"go/ast"
	"go/types"
	"path/filepath"
	"strings"

	"github.com/cridiv/codelens/analyzer"
	"github.com/cridiv/codelens/graph"
	"golang.org/x/tools/go/packages"
)

// Analyzer implements static analysis for Go codebases.
type Analyzer struct{}

// New creates a new Go static analyzer.
func New() *Analyzer {
	return &Analyzer{}
}

// Ensure Analyzer implements analyzer.Analyzer interface at compile time.
var _ analyzer.Analyzer = (*Analyzer)(nil)

// Analyze statically inspects a Go repository at repoPath and returns an architectural Graph.
func (a *Analyzer) Analyze(repoPath string) (*graph.Graph, error) {
	absRepoPath, err := filepath.Abs(repoPath)
	if err != nil {
		return nil, fmt.Errorf("resolving repo path %s: %w", repoPath, err)
	}

	cfg := &packages.Config{
		Mode: packages.NeedName | packages.NeedFiles | packages.NeedCompiledGoFiles |
			packages.NeedSyntax | packages.NeedTypes | packages.NeedTypesInfo |
			packages.NeedImports | packages.NeedDeps | packages.NeedModule,
		Dir:   absRepoPath,
		Tests: false,
	}

	pkgs, err := packages.Load(cfg, "./...")
	if err != nil {
		return nil, fmt.Errorf("loading packages from %s: %w", repoPath, err)
	}

	if len(pkgs) == 0 {
		return nil, fmt.Errorf("no Go packages found in %s", repoPath)
	}

	g := graph.New()

	// Determine root module path for local-package filtering
	var rootModulePath string
	for _, p := range pkgs {
		if p.Module != nil && p.Module.Path != "" {
			rootModulePath = p.Module.Path
			break
		}
	}

	// isLocalPkg returns true only for packages belonging to this module.
	isLocalPkg := func(pkgPath string) bool {
		if rootModulePath != "" {
			return strings.HasPrefix(pkgPath, rootModulePath)
		}
		return !strings.Contains(pkgPath, ".") // fallback heuristic for GOPATH-style
	}

	// 1. Process packages & their files
	for _, pkg := range pkgs {
		if !isLocalPkg(pkg.PkgPath) {
			continue
		}

		pkgNodeID := "pkg:" + pkg.PkgPath
		relPkgPath := pkg.PkgPath
		if rootModulePath != "" && strings.HasPrefix(relPkgPath, rootModulePath) {
			relPkgPath = strings.TrimPrefix(relPkgPath, rootModulePath)
			relPkgPath = strings.TrimPrefix(relPkgPath, "/")
			if relPkgPath == "" {
				relPkgPath = "."
			}
		}

		g.AddNode(graph.Node{
			ID:   pkgNodeID,
			Kind: "package",
			Name: pkg.Name,
			Path: relPkgPath,
			Metadata: map[string]string{
				"package":     pkg.Name,
				"import_path": pkg.PkgPath,
			},
		})

		// Package import edges (local only)
		for impPath := range pkg.Imports {
			if isLocalPkg(impPath) {
				g.AddEdge(graph.Edge{
					From: pkgNodeID,
					To:   "pkg:" + impPath,
					Kind: "imports",
				})
			}
		}

		// Process each syntax file in this package
		for _, fileAST := range pkg.Syntax {
			pos := pkg.Fset.Position(fileAST.Pos())
			absFilePath := pos.Filename
			if absFilePath == "" {
				continue
			}

			relFilePath, relErr := filepath.Rel(absRepoPath, absFilePath)
			if relErr != nil {
				relFilePath = absFilePath
			}

			fileNodeID := "file:" + relFilePath
			g.AddNode(graph.Node{
				ID:   fileNodeID,
				Kind: "file",
				Name: filepath.Base(relFilePath),
				Path: relFilePath,
				Metadata: map[string]string{
					"package":      pkg.Name,
					"package_path": pkg.PkgPath,
				},
			})

			// Package → File containment
			g.AddEdge(graph.Edge{
				From: pkgNodeID,
				To:   fileNodeID,
				Kind: "contains",
			})

			// Extract type and function declarations from this file
			a.extractDecls(g, pkg, fileAST, relFilePath)
		}
	}

	// 2. Call graph edges (resolved via type info, across all packages)
	a.extractCalls(g, pkgs, isLocalPkg)

	// 3. Interface implementation edges + struct field reference edges
	a.extractImplementationsAndReferences(g, pkgs, isLocalPkg)

	return g, nil
}

// extractDecls walks top-level declarations in a file and adds type, interface,
// and function nodes along with their containment edges.
func (a *Analyzer) extractDecls(g *graph.Graph, pkg *packages.Package, fileAST *ast.File, relFilePath string) {
	fileNodeID := "file:" + relFilePath

	for _, decl := range fileAST.Decls {
		switch d := decl.(type) {

		// Type declarations: structs, interfaces, and aliases
		case *ast.GenDecl:
			for _, spec := range d.Specs {
				ts, ok := spec.(*ast.TypeSpec)
				if !ok {
					continue
				}

				typeName := ts.Name.Name
				typeID := fmt.Sprintf("type:%s.%s", pkg.PkgPath, typeName)

				// Fix: prefer per-spec doc over the group doc to avoid
				// attaching the same comment to every type in a grouped block.
				doc := ""
				if ts.Doc != nil {
					doc = strings.TrimSpace(ts.Doc.Text())
				} else if len(d.Specs) == 1 && d.Doc != nil {
					// Only fall back to the GenDecl doc when there is exactly
					// one spec — otherwise the group doc is ambiguous.
					doc = strings.TrimSpace(d.Doc.Text())
				}

				kind := "type"
				var sig string
				switch ts.Type.(type) {
				case *ast.StructType:
					kind = "type"
					sig = fmt.Sprintf("type %s struct", typeName)
				case *ast.InterfaceType:
					kind = "interface"
					sig = fmt.Sprintf("type %s interface", typeName)
				default:
					kind = "type"
					sig = fmt.Sprintf("type %s", typeName)
				}

				g.AddNode(graph.Node{
					ID:   typeID,
					Kind: kind,
					Name: typeName,
					Path: relFilePath,
					Metadata: map[string]string{
						"package":      pkg.Name,
						"package_path": pkg.PkgPath,
						"file":         filepath.Base(relFilePath),
						"signature":    sig,
						"doc":          doc,
					},
				})

				// File → Type containment
				g.AddEdge(graph.Edge{
					From: fileNodeID,
					To:   typeID,
					Kind: "contains",
				})

				// For interface types, emit a function node per method signature.
				// This ensures that calls resolved to interface methods (rather than
				// a concrete implementation) have a target node in the graph.
				if iface, ok := ts.Type.(*ast.InterfaceType); ok {
					for _, method := range iface.Methods.List {
						if len(method.Names) == 0 {
							continue // embedded interface — skip
						}
						methodName := method.Names[0].Name
						methodID := fmt.Sprintf("fn:%s.%s.%s", pkg.PkgPath, typeName, methodName)
						methodDoc := ""
						if method.Doc != nil {
							methodDoc = strings.TrimSpace(method.Doc.Text())
						}

						g.AddNode(graph.Node{
							ID:   methodID,
							Kind: "function",
							Name: methodName,
							Path: relFilePath,
							Metadata: map[string]string{
								"package":      pkg.Name,
								"package_path": pkg.PkgPath,
								"file":         filepath.Base(relFilePath),
								"receiver":     typeName,
								"signature":    fmt.Sprintf("%s(...)", methodName),
								"doc":          methodDoc,
							},
						})
						// Interface → Method containment
						g.AddEdge(graph.Edge{
							From: typeID,
							To:   methodID,
							Kind: "contains",
						})
					}
				}
			}

		// Function and method declarations
		case *ast.FuncDecl:
			funcName := d.Name.Name
			doc := ""
			if d.Doc != nil {
				doc = strings.TrimSpace(d.Doc.Text())
			}

			if d.Recv != nil && len(d.Recv.List) > 0 {
				// Receiver method: fn:<pkg>.<ReceiverType>.<MethodName>
				recvType := receiverTypeName(d.Recv.List[0].Type)
				methodID := fmt.Sprintf("fn:%s.%s.%s", pkg.PkgPath, recvType, funcName)
				sig := fmt.Sprintf("func (%s) %s(...)", recvType, funcName)

				g.AddNode(graph.Node{
					ID:   methodID,
					Kind: "function",
					Name: funcName,
					Path: relFilePath,
					Metadata: map[string]string{
						"package":      pkg.Name,
						"package_path": pkg.PkgPath,
						"file":         filepath.Base(relFilePath),
						"signature":    sig,
						"receiver":     recvType,
						"doc":          doc,
					},
				})

				// Struct → Method containment
				structID := fmt.Sprintf("type:%s.%s", pkg.PkgPath, recvType)
				g.AddEdge(graph.Edge{
					From: structID,
					To:   methodID,
					Kind: "contains",
				})
			} else {
				// Standalone function: fn:<pkg>.<FuncName>
				funcID := fmt.Sprintf("fn:%s.%s", pkg.PkgPath, funcName)
				sig := fmt.Sprintf("func %s(...)", funcName)

				g.AddNode(graph.Node{
					ID:   funcID,
					Kind: "function",
					Name: funcName,
					Path: relFilePath,
					Metadata: map[string]string{
						"package":      pkg.Name,
						"package_path": pkg.PkgPath,
						"file":         filepath.Base(relFilePath),
						"signature":    sig,
						"doc":          doc,
					},
				})

				// File → Function containment
				g.AddEdge(graph.Edge{
					From: fileNodeID,
					To:   funcID,
					Kind: "contains",
				})
			}
		}
	}
}

// receiverTypeName extracts the base type name from a receiver expression,
// handling both value receivers (T) and pointer receivers (*T).
func receiverTypeName(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.Ident:
		return e.Name
	case *ast.StarExpr:
		return receiverTypeName(e.X)
	case *ast.IndexExpr: // generic receiver: T[A]
		return receiverTypeName(e.X)
	default:
		return "Unknown"
	}
}

// extractCalls resolves function call expressions to their callee declarations
// using the type checker info and emits directed "calls" edges.
func (a *Analyzer) extractCalls(g *graph.Graph, pkgs []*packages.Package, isLocalPkg func(string) bool) {
	for _, pkg := range pkgs {
		if !isLocalPkg(pkg.PkgPath) || pkg.TypesInfo == nil {
			continue
		}

		for _, fileAST := range pkg.Syntax {
			for _, decl := range fileAST.Decls {
				fnDecl, ok := decl.(*ast.FuncDecl)
				if !ok || fnDecl.Body == nil {
					continue
				}

				// Build the caller node ID using the same scheme as extractDecls
				var callerID string
				if fnDecl.Recv != nil && len(fnDecl.Recv.List) > 0 {
					recvType := receiverTypeName(fnDecl.Recv.List[0].Type)
					callerID = fmt.Sprintf("fn:%s.%s.%s", pkg.PkgPath, recvType, fnDecl.Name.Name)
				} else {
					callerID = fmt.Sprintf("fn:%s.%s", pkg.PkgPath, fnDecl.Name.Name)
				}

				ast.Inspect(fnDecl.Body, func(n ast.Node) bool {
					callExpr, isCall := n.(*ast.CallExpr)
					if !isCall {
						return true
					}

					// Resolve callee to a *types.Func via type info
					var calleeFn *types.Func
					switch fun := callExpr.Fun.(type) {
					case *ast.Ident:
						if obj, ok := pkg.TypesInfo.Uses[fun]; ok {
							calleeFn, _ = obj.(*types.Func)
						}
					case *ast.SelectorExpr:
						// Method call (value.Method or pkg.Func)
						if sel, ok := pkg.TypesInfo.Selections[fun]; ok {
							calleeFn, _ = sel.Obj().(*types.Func)
						} else if obj, ok := pkg.TypesInfo.Uses[fun.Sel]; ok {
							calleeFn, _ = obj.(*types.Func)
						}
					}

					if calleeFn == nil || calleeFn.Pkg() == nil || !isLocalPkg(calleeFn.Pkg().Path()) {
						return true
					}

					// Build callee ID using receiver info from the type signature
					var calleeID string
					sig, isSig := calleeFn.Type().(*types.Signature)
					if isSig && sig.Recv() != nil {
						recvNamed := typeToNamed(sig.Recv().Type())
						if recvNamed != "" {
							calleeID = fmt.Sprintf("fn:%s.%s.%s", calleeFn.Pkg().Path(), recvNamed, calleeFn.Name())
						} else {
							calleeID = fmt.Sprintf("fn:%s.%s", calleeFn.Pkg().Path(), calleeFn.Name())
						}
					} else {
						calleeID = fmt.Sprintf("fn:%s.%s", calleeFn.Pkg().Path(), calleeFn.Name())
					}

					if callerID != calleeID {
						// AddEdge already deduplicates, so calling multiple times per
						// call-site (e.g. same function called in a loop) is safe.
						g.AddEdge(graph.Edge{
							From: callerID,
							To:   calleeID,
							Kind: "calls",
						})
					}

					return true
				})
			}
		}
	}
}

// typeToNamed unwraps a pointer and returns the underlying named type's name,
// or the empty string if the type is not a named type.
func typeToNamed(t types.Type) string {
	if ptr, ok := t.(*types.Pointer); ok {
		t = ptr.Elem()
	}
	if named, ok := t.(*types.Named); ok {
		return named.Obj().Name()
	}
	return ""
}

// extractImplementationsAndReferences emits "implements" edges (struct → interface)
// and "references" edges (struct → field type) for all local named types.
func (a *Analyzer) extractImplementationsAndReferences(g *graph.Graph, pkgs []*packages.Package, isLocalPkg func(string) bool) {
	var structs []*types.Named
	var interfaces []*types.Named

	for _, pkg := range pkgs {
		if !isLocalPkg(pkg.PkgPath) || pkg.Types == nil {
			continue
		}

		scope := pkg.Types.Scope()
		for _, name := range scope.Names() {
			obj := scope.Lookup(name)
			named, ok := obj.Type().(*types.Named)
			if !ok {
				continue
			}

			switch named.Underlying().(type) {
			case *types.Struct:
				structs = append(structs, named)
			case *types.Interface:
				interfaces = append(interfaces, named)
			}
		}
	}

	// 1. Interface satisfaction: StructType → InterfaceType
	for _, s := range structs {
		if s.Obj() == nil || s.Obj().Pkg() == nil {
			continue
		}
		structID := fmt.Sprintf("type:%s.%s", s.Obj().Pkg().Path(), s.Obj().Name())

		for _, iface := range interfaces {
			if iface.Obj() == nil || iface.Obj().Pkg() == nil {
				continue
			}
			ifaceID := fmt.Sprintf("type:%s.%s", iface.Obj().Pkg().Path(), iface.Obj().Name())

			ifaceType, ok := iface.Underlying().(*types.Interface)
			if !ok {
				continue
			}

			// Check value and pointer receivers — common in Go (e.g. *MemoryStore implements Store)
			if types.Implements(s, ifaceType) || types.Implements(types.NewPointer(s), ifaceType) {
				g.AddEdge(graph.Edge{
					From: structID,
					To:   ifaceID,
					Kind: "implements",
					Metadata: map[string]string{
						"label": fmt.Sprintf("%s implements %s", s.Obj().Name(), iface.Obj().Name()),
					},
				})
			}
		}

		// 2. Struct field type references: StructType → FieldType
		// Fix: resolve the field type's owning package from the type itself,
		// not from field.Pkg() which returns the parent struct's package.
		if st, ok := s.Underlying().(*types.Struct); ok {
			for i := 0; i < st.NumFields(); i++ {
				field := st.Field(i)

				fieldType := field.Type()
				if ptr, ok := fieldType.(*types.Pointer); ok {
					fieldType = ptr.Elem()
				}
				named, ok := fieldType.(*types.Named)
				if !ok || named.Obj() == nil || named.Obj().Pkg() == nil {
					continue
				}

				// Only emit references to types within this module
				if !isLocalPkg(named.Obj().Pkg().Path()) {
					continue
				}

				refID := fmt.Sprintf("type:%s.%s", named.Obj().Pkg().Path(), named.Obj().Name())
				if structID != refID {
					g.AddEdge(graph.Edge{
						From: structID,
						To:   refID,
						Kind: "references",
						Metadata: map[string]string{
							"label": fmt.Sprintf("field %s", field.Name()),
						},
					})
				}
			}
		}
	}
}
