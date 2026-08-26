import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  PanOnScrollMode,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useStore } from '../store/useStore';
import { SchemaNode } from './nodes/SchemaNode';
import { PackageClusterNode } from './nodes/PackageClusterNode';
import { CustomEdge } from './edges/CustomEdge';
import { computeGraphLayout, LayoutGraph, LayoutNode } from '../utils/layout';
import {
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  Eye,
  EyeOff,
  LayoutGrid,
  Boxes,
  FolderOpen,
} from 'lucide-react';

const nodeTypes = {
  schemaNode: SchemaNode,
  packageClusterNode: PackageClusterNode,
};

const edgeTypes = {
  customEdge: CustomEdge,
};

function CanvasContent() {
  const {
    graph,
    selectNode,
    searchQuery,
    activeKindFilters,
    layoutDirection,
    showMiniMap,
    toggleMiniMap,
    layoutEpoch,
    triggerAutoLayout,
    breadcrumbs,
    popBreadcrumb,
    scopeMode,
    activeFilePath,
    activePackage,
  } = useStore();

  const reactFlowInstance = useReactFlow();

  // For repositories with many nodes (e.g. > 50), default to clustered macro overview
  const [overviewMode, setOverviewMode] = useState<'clustered' | 'flattened'>('clustered');

  // Compute scoped graph based on scopeMode (file vs package vs all)
  const scopedGraph: LayoutGraph = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // Helper: matches search query and kind filters
    const matchesFilters = (n: typeof graph.nodes[0]) => {
      const matchesKind = activeKindFilters.has(n.kind);
      if (!matchesKind) return false;
      if (!query) return true;

      const matchesName = n.name.toLowerCase().includes(query);
      const matchesPath = n.path.toLowerCase().includes(query);
      const matchesMember = n.members?.some(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.type.toLowerCase().includes(query)
      );
      return matchesName || matchesPath || matchesMember;
    };

    // ── 1. File Scope Mode ──────────────────────────────────────────────────
    if (scopeMode === 'file' && activeFilePath) {
      // Primary nodes belonging to the active file
      const nativeNodes = graph.nodes.filter(
        (n) => n.path === activeFilePath && matchesFilters(n)
      );
      const nativeNodeIds = new Set(nativeNodes.map((n) => n.id));

      // Find connected cross-file edges
      const connectedEdges = graph.edges.filter(
        (e) => nativeNodeIds.has(e.from) || nativeNodeIds.has(e.to)
      );

      // Collect external nodes connected to native nodes
      const externalNodeIds = new Set<string>();
      connectedEdges.forEach((e) => {
        if (!nativeNodeIds.has(e.from)) externalNodeIds.add(e.from);
        if (!nativeNodeIds.has(e.to)) externalNodeIds.add(e.to);
      });

      const externalNodes: LayoutNode[] = graph.nodes
        .filter((n) => externalNodeIds.has(n.id) && matchesFilters(n))
        .map((n) => ({
          ...n,
          isExternal: true,
        }));

      const allScopedNodes: LayoutNode[] = [
        ...nativeNodes.map((n) => ({ ...n, isExternal: false })),
        ...externalNodes,
      ];
      const allScopedNodeIds = new Set(allScopedNodes.map((n) => n.id));

      const visibleEdges = connectedEdges.filter(
        (e) => allScopedNodeIds.has(e.from) && allScopedNodeIds.has(e.to)
      );

      return {
        nodes: allScopedNodes,
        edges: visibleEdges,
      };
    }

    // ── 2. Package Scope Mode ───────────────────────────────────────────────
    if (scopeMode === 'package' && activePackage) {
      const pkgNodes = graph.nodes.filter(
        (n) => n.metadata?.package === activePackage && matchesFilters(n)
      );
      const pkgNodeIds = new Set(pkgNodes.map((n) => n.id));

      // Also collect 1-hop external boundary nodes referenced by this package
      const connectedEdges = graph.edges.filter(
        (e) => pkgNodeIds.has(e.from) || pkgNodeIds.has(e.to)
      );

      const externalNodeIds = new Set<string>();
      connectedEdges.forEach((e) => {
        if (!pkgNodeIds.has(e.from)) externalNodeIds.add(e.from);
        if (!pkgNodeIds.has(e.to)) externalNodeIds.add(e.to);
      });

      const externalNodes: LayoutNode[] = graph.nodes
        .filter((n) => externalNodeIds.has(n.id) && matchesFilters(n))
        .slice(0, 15) // cap boundary nodes to keep canvas ultra fast
        .map((n) => ({
          ...n,
          isExternal: true,
        }));

      const allScopedNodes: LayoutNode[] = [
        ...pkgNodes.map((n) => ({ ...n, isExternal: false })),
        ...externalNodes,
      ];
      const allScopedNodeIds = new Set(allScopedNodes.map((n) => n.id));

      const visibleEdges = connectedEdges.filter(
        (e) => allScopedNodeIds.has(e.from) && allScopedNodeIds.has(e.to)
      );

      return {
        nodes: allScopedNodes,
        edges: visibleEdges,
      };
    }

    // ── 3. CodeOverview Mode (Clustered or Flattened) ────────────────────────
    if (overviewMode === 'clustered' && graph.nodes.length > 30) {
      // Group by package
      const pkgGroups: Record<string, typeof graph.nodes> = {};
      graph.nodes.forEach((n) => {
        const pkg = n.metadata?.package || 'root';
        if (!pkgGroups[pkg]) pkgGroups[pkg] = [];
        pkgGroups[pkg].push(n);
      });

      const clusterNodes: LayoutNode[] = Object.entries(pkgGroups).map(([pkgName, nodes]) => {
        const filesSet = new Set(nodes.map((n) => n.path).filter(Boolean));
        const types = nodes.filter((n) => n.kind === 'type' || n.kind === 'table');
        const functions = nodes.filter((n) => n.kind === 'function');
        const interfaces = nodes.filter((n) => n.kind === 'interface');

        const topSymbols = [
          ...types.slice(0, 3).map((t) => ({ name: t.name, kind: t.kind })),
          ...interfaces.slice(0, 2).map((i) => ({ name: i.name, kind: i.kind })),
          ...functions.slice(0, 2).map((f) => ({ name: f.name, kind: f.kind })),
        ];

        return {
          id: `pkg:${pkgName}`,
          kind: 'packageCluster' as any,
          name: pkgName,
          path: `pkg/${pkgName}`,
          metadata: {
            package: pkgName,
            totalEntities: nodes.length,
            totalFiles: filesSet.size,
            typesCount: types.length,
            functionsCount: functions.length,
            interfacesCount: interfaces.length,
            topSymbols,
          },
        };
      });

      // Compute aggregate cross-package call dependencies
      const nodeToPkg: Record<string, string> = {};
      graph.nodes.forEach((n) => {
        nodeToPkg[n.id] = n.metadata?.package || 'root';
      });

      const clusterEdgeCounts: Record<string, { from: string; to: string; count: number }> = {};
      graph.edges.forEach((e) => {
        const fromPkg = nodeToPkg[e.from];
        const toPkg = nodeToPkg[e.to];
        if (fromPkg && toPkg && fromPkg !== toPkg) {
          const edgeKey = `${fromPkg}->${toPkg}`;
          if (!clusterEdgeCounts[edgeKey]) {
            clusterEdgeCounts[edgeKey] = { from: `pkg:${fromPkg}`, to: `pkg:${toPkg}`, count: 0 };
          }
          clusterEdgeCounts[edgeKey].count += 1;
        }
      });

      const clusterEdges = Object.values(clusterEdgeCounts).map((ce, idx) => ({
        id: `cp-edge-${idx}`,
        from: ce.from,
        to: ce.to,
        kind: 'calls' as const,
        metadata: {
          label: `${ce.count} ${ce.count === 1 ? 'call' : 'calls'}`,
        },
      }));

      return {
        nodes: clusterNodes,
        edges: clusterEdges,
      };
    }

    // Default: Full Flattened
    const visibleNodes = graph.nodes.filter(matchesFilters);
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = graph.edges.filter(
      (e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to)
    );

    return {
      nodes: visibleNodes.map((n) => ({ ...n, isExternal: false })),
      edges: visibleEdges,
    };
  }, [graph, scopeMode, activeFilePath, activePackage, searchQuery, activeKindFilters, overviewMode]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const isInitialLayoutDone = useRef(false);
  const prevScopeRef = useRef(`${scopeMode}:${activeFilePath}:${activePackage}:${overviewMode}`);

  // Compute layout whenever scopedGraph, layoutDirection or layoutEpoch changes
  useEffect(() => {
    const isClusteredOverview = scopeMode === 'all' && overviewMode === 'clustered';
    const { nodes: layoutedNodes, edges: layoutedEdges } = computeGraphLayout(
      scopedGraph,
      {
        direction: layoutDirection,
        nodeWidth: isClusteredOverview ? 340 : 310,
        rankSep: isClusteredOverview ? 90 : 80,
        nodeSep: isClusteredOverview ? 60 : 45,
      }
    );

    const formattedEdges = layoutedEdges.map((e) => ({
      ...e,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: '#94a3b8',
      },
    }));

    setNodes(layoutedNodes);
    setEdges(formattedEdges);

    const currentScopeKey = `${scopeMode}:${activeFilePath}:${activePackage}:${overviewMode}`;
    const isScopeChanged = prevScopeRef.current !== currentScopeKey;
    prevScopeRef.current = currentScopeKey;

    // Auto fit view on mount, on scope changes, or when Auto Layout button is pressed
    if (!isInitialLayoutDone.current || isScopeChanged || layoutEpoch > 0) {
      isInitialLayoutDone.current = true;
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 350 });
      }, 50);
    }
  }, [scopedGraph, layoutDirection, layoutEpoch, scopeMode, activeFilePath, activePackage, overviewMode, reactFlowInstance, setNodes, setEdges]);

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onPaneClick={onPaneClick}
        fitView
        onlyRenderVisibleElements={true}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        elevateEdgesOnSelect={false}
        edgesFocusable={false}
        minZoom={0.05}
        maxZoom={2.5}
        panOnScroll={true}
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnPinch={true}
        zoomOnScroll={false}
        panOnDrag={[1, 2]}
        preventScrolling={true}
        defaultEdgeOptions={{
          type: 'customEdge',
        }}
        proOptions={{ hideAttribution: true }}
      >
        {/* Soft Modern Dot Grid Background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="#cbd5e1"
          style={{ backgroundColor: '#f8fafc' }}
        />

        {/* Top Header: Breadcrumbs & Scope Switcher */}
        <Panel position="top-left" style={{ margin: '14px 16px', maxWidth: 'calc(100% - 320px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Breadcrumbs Row */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(8px)',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '6px 12px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.78rem',
              }}
            >
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={crumb.id || idx}>
                    <button
                      onClick={() => {
                        if (isLast) return;
                        if (crumb.kind === 'root') {
                          popBreadcrumb(0);
                        } else if (crumb.kind === 'package' && crumb.targetPackage) {
                          popBreadcrumb(idx);
                        } else if (crumb.kind === 'file' && crumb.targetPath) {
                          popBreadcrumb(idx);
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: isLast ? 'default' : 'pointer',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        color: isLast ? '#0f172a' : '#64748b',
                        fontWeight: isLast ? 700 : 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      className={!isLast ? 'hover:bg-slate-100 hover:text-blue-600' : ''}
                    >
                      {crumb.kind === 'root' && <Sparkles size={13} color="#2563eb" />}
                      {crumb.kind === 'package' && <Boxes size={13} color="#4f46e5" />}
                      {crumb.kind === 'file' && <FolderOpen size={13} color="#7c3aed" />}
                      <span>{crumb.name}</span>
                    </button>
                    {!isLast && <ChevronRight size={12} color="#94a3b8" />}
                  </React.Fragment>
                );
              })}

              {/* Clustered vs Flattened Toggle when in CodeOverview */}
              {scopeMode === 'all' && graph.nodes.length > 30 && (
                <div style={{ marginLeft: 12, borderLeft: '1px solid #e2e8f0', paddingLeft: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => setOverviewMode('clustered')}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      border: 'none',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor: overviewMode === 'clustered' ? '#eff6ff' : 'transparent',
                      color: overviewMode === 'clustered' ? '#2563eb' : '#64748b',
                    }}
                  >
                    📦 Clustered Packages
                  </button>
                  <button
                    onClick={() => setOverviewMode('flattened')}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      border: 'none',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor: overviewMode === 'flattened' ? '#eff6ff' : 'transparent',
                      color: overviewMode === 'flattened' ? '#2563eb' : '#64748b',
                    }}
                  >
                    🌐 Flatten All ({graph.nodes.length})
                  </button>
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* Floating Bottom Left Status Pill */}
        <Panel position="bottom-left" style={{ margin: '14px 16px' }}>
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #e2e8f0',
              borderRadius: '20px',
              padding: '5px 12px',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.72rem',
              color: '#475569',
            }}
          >
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981' }} />
            <span>
              <strong>{nodes.length}</strong> {nodes.length === 1 ? 'entity' : 'entities'} • <strong>{edges.length}</strong> connections
            </span>
          </div>
        </Panel>

        {/* Top Right Canvas Toolbar */}
        <Panel position="top-right" style={{ margin: '14px 16px' }}>
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '4px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <button
              onClick={() => reactFlowInstance.zoomIn({ duration: 200 })}
              title="Zoom in"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '5px',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
              }}
              className="hover:bg-slate-100"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={() => reactFlowInstance.zoomOut({ duration: 200 })}
              title="Zoom out"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '5px',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
              }}
              className="hover:bg-slate-100"
            >
              <ZoomOut size={15} />
            </button>
            <div style={{ width: 1, height: 16, backgroundColor: '#e2e8f0', margin: '0 2px' }} />
            <button
              onClick={() => reactFlowInstance.fitView({ padding: 0.2, duration: 350 })}
              title="Fit graph to view"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '5px',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
              }}
              className="hover:bg-slate-100"
            >
              <Maximize2 size={15} />
            </button>
            <button
              onClick={triggerAutoLayout}
              title="Rearrange Auto Layout"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '5px',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
              }}
              className="hover:bg-slate-100"
            >
              <LayoutGrid size={15} />
            </button>
            <div style={{ width: 1, height: 16, backgroundColor: '#e2e8f0', margin: '0 2px' }} />
            <button
              onClick={toggleMiniMap}
              title={showMiniMap ? 'Hide mini-map' : 'Show mini-map'}
              style={{
                background: showMiniMap ? '#eff6ff' : 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '5px',
                color: showMiniMap ? '#2563eb' : '#475569',
                display: 'flex',
                alignItems: 'center',
              }}
              className="hover:bg-slate-100"
            >
              {showMiniMap ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>
        </Panel>

        {/* Optional MiniMap */}
        {showMiniMap && (
          <MiniMap
            nodeColor={(n) => {
              if (n.type === 'packageClusterNode') return '#4f46e5';
              const rawKind = n.data?.node?.kind;
              if (rawKind === 'interface') return '#d97706';
              if (rawKind === 'type') return '#059669';
              if (rawKind === 'function') return '#2563eb';
              return '#94a3b8';
            }}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              margin: '14px 16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
            maskColor="rgba(241, 245, 249, 0.7)"
          />
        )}
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasContent />
    </ReactFlowProvider>
  );
}
