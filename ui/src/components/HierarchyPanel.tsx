import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { NodeKind } from '../types/graph';
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
} from 'lucide-react';

export const HierarchyPanel: React.FC = () => {
  const {
    graph,
    selectedNodeId,
    selectNode,
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
    all: true,
  });

  const togglePackage = (pkgName: string) => {
    setExpandedPackages((prev) => ({
      ...prev,
      [pkgName]: !prev[pkgName],
    }));
  };

  // Group nodes by package/module
  const groupedNodes = useMemo(() => {
    const groups: Record<string, typeof graph.nodes> = {};

    graph.nodes.forEach((node) => {
      const pkg = node.metadata?.package || 'root';
      if (!groups[pkg]) groups[pkg] = [];
      groups[pkg].push(node);
    });

    return groups;
  }, [graph.nodes]);

  const stats = useMemo(() => {
    return {
      totalEntities: graph.nodes.length,
      totalEdges: graph.edges.length,
      structsCount: graph.nodes.filter((n) => n.kind === 'type' || n.kind === 'table').length,
      interfacesCount: graph.nodes.filter((n) => n.kind === 'interface').length,
    };
  }, [graph]);

  const kindFilterButtons: { kind: NodeKind; label: string; icon: React.ReactNode }[] = [
    { kind: 'type', label: 'Structs', icon: <Boxes size={12} /> },
    { kind: 'interface', label: 'Interfaces', icon: <Layers size={12} /> },
    { kind: 'function', label: 'Functions', icon: <FunctionSquare size={12} /> },
    { kind: 'file', label: 'Files', icon: <FileCode2 size={12} /> },
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
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Compass size={16} color="#3b82f6" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
              Schema Explorer
            </span>
          </div>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              backgroundColor: '#f1f5f9',
              color: '#475569',
              padding: '2px 7px',
              borderRadius: '12px',
            }}
          >
            {stats.totalEntities} entities
          </span>
        </div>

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
            placeholder="Filter entities, methods..."
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

      {/* Codebase Tree List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {Object.entries(groupedNodes).map(([pkgName, nodes]) => {
          const isExpanded = expandedPackages[pkgName] !== false;
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

          if (filteredNodes.length === 0) return null;

          return (
            <div key={pkgName} style={{ marginBottom: 4 }}>
              {/* Package Header Bar */}
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
                  {isExpanded ? (
                    <ChevronDown size={14} color="#64748b" />
                  ) : (
                    <ChevronRight size={14} color="#64748b" />
                  )}
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: '#334155',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    pkg/{pkgName}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.65rem',
                    color: '#94a3b8',
                    fontWeight: 600,
                  }}
                >
                  {filteredNodes.length}
                </span>
              </div>

              {/* Package Entities */}
              {isExpanded && (
                <div
                  style={{
                    paddingLeft: 12,
                    marginTop: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    borderLeft: '1px solid #f1f5f9',
                    marginLeft: 12,
                  }}
                >
                  {filteredNodes.map((node) => {
                    const isSelected = selectedNodeId === node.id;
                    const memberCount = node.members?.length || 0;

                    return (
                      <div
                        key={node.id}
                        onClick={() => selectNode(node.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                          border: isSelected
                            ? '1px solid #bfdbfe'
                            : '1px solid transparent',
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
                          {node.kind === 'interface' ? (
                            <Layers size={13} color="#d97706" />
                          ) : (
                            <Boxes size={13} color="#059669" />
                          )}
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: isSelected ? 600 : 500,
                              color: isSelected ? '#1d4ed8' : '#1e293b',
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
                            fontSize: '0.65rem',
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
