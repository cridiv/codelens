import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { NodeKind, Node } from '../types/graph';
import {
  Boxes,
  Layers,
  FileCode2,
  FunctionSquare,
  Search,
  ChevronRight,
  ChevronDown,
  Database,
  Compass,
  LayoutGrid,
} from 'lucide-react';

export const HierarchyPanel: React.FC = () => {
  const {
    graph,
    selectedNodeId,
    selectNode,
    activeFilePath,
    setActiveFile,
    setActivePackage,
    scopeMode,
    setScopeMode,
    searchQuery,
    setSearchQuery,
    activeKindFilters,
    toggleKindFilter,
  } = useStore();

  const [expandedPackages, setExpandedPackages] = useState<Record<string, boolean>>({
    auth: true,
    models: true,
    server: true,
    db: true,
  });

  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({
    'internal/auth/service.go': true,
    'internal/auth/token_store.go': true,
    'internal/models/user.go': true,
    'internal/models/session.go': true,
    'internal/models/org.go': true,
    'internal/server/router.go': true,
    'internal/db/postgres.go': true,
  });

  const togglePackage = (pkgName: string) => {
    setExpandedPackages((prev) => ({
      ...prev,
      [pkgName]: !prev[pkgName],
    }));
  };

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [filePath]: !prev[filePath],
    }));
  };

  // Group nodes by package -> file
  const treeData = useMemo(() => {
    const packages: Record<string, Record<string, Node[]>> = {};

    graph.nodes.forEach((node) => {
      const pkg = node.metadata?.package || 'other';
      const file = node.path || 'unknown.go';

      if (!packages[pkg]) packages[pkg] = {};
      if (!packages[pkg][file]) packages[pkg][file] = [];
      packages[pkg][file].push(node);
    });

    return packages;
  }, [graph.nodes]);

  const uniqueFilesCount = useMemo(() => {
    const set = new Set(graph.nodes.map((n) => n.path));
    return set.size;
  }, [graph.nodes]);

  const stats = useMemo(() => {
    return {
      totalEntities: graph.nodes.length,
      totalFiles: uniqueFilesCount,
      totalEdges: graph.edges.length,
      structsCount: graph.nodes.filter((n) => n.kind === 'type' || n.kind === 'table').length,
      interfacesCount: graph.nodes.filter((n) => n.kind === 'interface').length,
    };
  }, [graph, uniqueFilesCount]);

  const kindFilterButtons: { kind: NodeKind; label: string; icon: React.ReactNode }[] = [
    { kind: 'type', label: 'Structs', icon: <Boxes size={12} /> },
    { kind: 'interface', label: 'Interfaces', icon: <Layers size={12} /> },
    { kind: 'function', label: 'Functions', icon: <FunctionSquare size={12} /> },
  ];

  return (
    <aside
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar Header */}
      <div
        style={{
          padding: '14px 16px 12px 16px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Compass size={16} color="#2563eb" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
              Codebase Navigator
            </span>
          </div>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              backgroundColor: '#f1f5f9',
              color: '#475569',
              padding: '2px 7px',
              borderRadius: '12px',
            }}
          >
            {stats.totalFiles} files &middot; {stats.totalEntities} entities
          </span>
        </div>

        {/* Global Overview Scope Quick Toggle */}
        <button
          onClick={() => setScopeMode('all')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '0.74rem',
            fontWeight: 600,
            border: scopeMode === 'all' ? '1px solid #93c5fd' : '1px solid #e2e8f0',
            backgroundColor: scopeMode === 'all' ? '#eff6ff' : '#f8fafc',
            color: scopeMode === 'all' ? '#1d4ed8' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          className="hover:bg-slate-100"
        >
          <LayoutGrid size={13} />
          <span>Full Architecture Map</span>
        </button>

        {/* Search Field */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search
            size={14}
            color="#94a3b8"
            style={{ position: 'absolute', left: 10 }}
          />
          <input
            type="text"
            placeholder="Search files, schemas, methods..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 30px',
              fontSize: '0.78rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              outline: 'none',
              color: '#0f172a',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {/* Quick Filter Tags */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {kindFilterButtons.map((btn) => {
            const isActive = activeKindFilters.has(btn.kind);
            return (
              <button
                key={btn.kind}
                onClick={() => toggleKindFilter(btn.kind)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: 500,
                  border: isActive ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                  backgroundColor: isActive ? '#eff6ff' : '#ffffff',
                  color: isActive ? '#2563eb' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {btn.icon}
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3-Tier Codebase Tree: Package -> File -> Entity */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'scroll',
          overflowX: 'hidden',
          padding: '10px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {Object.entries(treeData).map(([pkgName, fileMap]) => {
          const isPkgExpanded = expandedPackages[pkgName] !== false;

          // Check if package matches search query
          const filesEntries = Object.entries(fileMap);
          const matchingFiles = filesEntries.filter(([filePath, nodes]) => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (
              filePath.toLowerCase().includes(q) ||
              pkgName.toLowerCase().includes(q) ||
              nodes.some(
                (n) =>
                  n.name.toLowerCase().includes(q) ||
                  n.members?.some((m) => m.name.toLowerCase().includes(q))
              )
            );
          });

          if (matchingFiles.length === 0) return null;

          return (
            <div key={pkgName} style={{ marginBottom: 4 }}>
              {/* Tier 1: Package Header */}
              <div
                onClick={() => togglePackage(pkgName)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: '#f8fafc',
                  userSelect: 'none',
                }}
                className="hover:bg-slate-100 transition-colors"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isPkgExpanded ? (
                    <ChevronDown size={14} color="#64748b" />
                  ) : (
                    <ChevronRight size={14} color="#64748b" />
                  )}
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#334155',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    pkg/{pkgName}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePackage(pkgName);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '0.65rem',
                      color: '#2563eb',
                      cursor: 'pointer',
                      padding: '1px 4px',
                      fontWeight: 600,
                    }}
                    title="View package map"
                  >
                    view
                  </button>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: '#94a3b8',
                      fontWeight: 600,
                    }}
                  >
                    {matchingFiles.length} {matchingFiles.length === 1 ? 'file' : 'files'}
                  </span>
                </div>
              </div>

              {/* Tier 2: Files in Package */}
              {isPkgExpanded && (
                <div
                  style={{
                    paddingLeft: 10,
                    marginTop: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    borderLeft: '1px solid #f1f5f9',
                    marginLeft: 10,
                  }}
                >
                  {matchingFiles.map(([filePath, nodes]) => {
                    const isFileExpanded = expandedFiles[filePath] !== false;
                    const isFileActive = scopeMode === 'file' && activeFilePath === filePath;
                    const fileName = filePath.split('/').pop() || filePath;

                    const filteredNodes = nodes.filter((n) => {
                      const matchesKind = activeKindFilters.has(n.kind);
                      if (!matchesKind) return false;
                      if (!searchQuery) return true;
                      return (
                        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        n.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        n.members?.some((m) =>
                          m.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                      );
                    });

                    return (
                      <div key={filePath} style={{ display: 'flex', flexDirection: 'column' }}>
                        {/* File Item Header (Clicking opens file schema) */}
                        <div
                          onClick={() => {
                            setActiveFile(filePath);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            backgroundColor: isFileActive ? '#eff6ff' : 'transparent',
                            border: isFileActive
                              ? '1px solid #bfdbfe'
                              : '1px solid transparent',
                            userSelect: 'none',
                          }}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              minWidth: 0,
                            }}
                          >
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFile(filePath);
                              }}
                              style={{ display: 'flex', alignItems: 'center', color: '#94a3b8' }}
                            >
                              {isFileExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </span>
                            <FileCode2
                              size={13}
                              color={isFileActive ? '#2563eb' : '#64748b'}
                              style={{ flexShrink: 0 }}
                            />
                            <span
                              style={{
                                fontSize: '0.76rem',
                                fontWeight: isFileActive ? 700 : 500,
                                color: isFileActive ? '#1d4ed8' : '#334155',
                                fontFamily: 'var(--font-mono), monospace',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={filePath}
                            >
                              {fileName}
                            </span>
                          </div>

                          <span
                            style={{
                              fontSize: '0.65rem',
                              color: isFileActive ? '#3b82f6' : '#94a3b8',
                              fontWeight: 600,
                              backgroundColor: isFileActive ? '#dbeafe' : '#f1f5f9',
                              padding: '1px 5px',
                              borderRadius: '4px',
                            }}
                          >
                            {nodes.length}
                          </span>
                        </div>

                        {/* Tier 3: Entities inside File */}
                        {isFileExpanded && filteredNodes.length > 0 && (
                          <div
                            style={{
                              paddingLeft: 16,
                              marginTop: 2,
                              marginBottom: 4,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                              borderLeft: '1px solid #f8fafc',
                              marginLeft: 12,
                            }}
                          >
                            {filteredNodes.map((node) => {
                              const isSelected = selectedNodeId === node.id;
                              const memberCount = node.members?.length || 0;

                              return (
                                <div
                                  key={node.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectNode(node.id, true);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '4px 8px',
                                    borderRadius: '5px',
                                    cursor: 'pointer',
                                    backgroundColor: isSelected ? '#e0e7ff' : 'transparent',
                                    border: isSelected
                                      ? '1px solid #c7d2fe'
                                      : '1px solid transparent',
                                  }}
                                  className="hover:bg-slate-50 transition-colors"
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 5,
                                      minWidth: 0,
                                    }}
                                  >
                                    {node.kind === 'interface' ? (
                                      <Layers size={12} color="#d97706" />
                                    ) : (
                                      <Boxes size={12} color="#059669" />
                                    )}
                                    <span
                                      style={{
                                        fontSize: '0.73rem',
                                        fontWeight: isSelected ? 600 : 400,
                                        color: isSelected ? '#3730a3' : '#475569',
                                        fontFamily: 'var(--font-mono), monospace',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                    >
                                      {node.name}
                                    </span>
                                  </div>

                                  <span
                                    style={{
                                      fontSize: '0.62rem',
                                      color: '#94a3b8',
                                      fontFamily: 'var(--font-mono), monospace',
                                    }}
                                  >
                                    {memberCount}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer Stats */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid #f1f5f9',
          backgroundColor: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          color: '#64748b',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Database size={12} color="#64748b" />
          {stats.structsCount} structs &middot; {stats.interfacesCount} interfaces
        </span>
        <span>{stats.totalEdges} relations</span>
      </div>
    </aside>
  );
};
