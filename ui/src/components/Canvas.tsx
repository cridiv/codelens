import React, { useCallback, useEffect, useMemo } from 'react';
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
import { CustomEdge } from './edges/CustomEdge';
import { computeGraphLayout } from '../utils/layout';
import {
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  MapPin,
  ChevronRight,
  Eye,
  EyeOff,
  LayoutGrid,
  Search,
} from 'lucide-react';

const nodeTypes = {
  schemaNode: SchemaNode,
};

const edgeTypes = {
  customEdge: CustomEdge,
};

function CanvasContent() {
  const {
    graph,
    selectedNodeId,
    selectNode,
    searchQuery,
    setSearchQuery,
    activeKindFilters,
    layoutDirection,
    setLayoutDirection,
    showEdgeLabels,
    toggleEdgeLabels,
    showMiniMap,
    toggleMiniMap,
    layoutEpoch,
    triggerAutoLayout,
    breadcrumbs,
    popBreadcrumb,
  } = useStore();

  const reactFlowInstance = useReactFlow();

  // Filter graph nodes according to searchQuery and activeKindFilters
  const filteredGraph = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const visibleNodes = graph.nodes.filter((node) => {
      const matchesKind = activeKindFilters.has(node.kind);
      if (!matchesKind) return false;
      if (!query) return true;

      const matchesName = node.name.toLowerCase().includes(query);
      const matchesPath = node.path.toLowerCase().includes(query);
      const matchesMember = node.members?.some(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.type.toLowerCase().includes(query)
      );
      return matchesName || matchesPath || matchesMember;
    });

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = graph.edges.filter(
      (e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to)
    );

    return {
      nodes: visibleNodes,
      edges: visibleEdges,
    };
  }, [graph, searchQuery, activeKindFilters]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const isInitialLayoutDone = React.useRef(false);

  // Compute layout whenever filtered graph, layoutDirection or layoutEpoch changes
  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = computeGraphLayout(
      filteredGraph,
      {
        direction: layoutDirection,
        nodeWidth: 320,
        rankSep: 100,
        nodeSep: 60,
      }
    );

    const formattedEdges = layoutedEdges.map((e) => ({
      ...e,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: '#94a3b8',
      },
    }));

    setNodes(layoutedNodes);
    setEdges(formattedEdges);

    // Only auto fit view on initial mount or when layoutEpoch (Auto Layout button) changes
    if (!isInitialLayoutDone.current || layoutEpoch > 0) {
      isInitialLayoutDone.current = true;
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.25, duration: 400 });
      }, 50);
    }
  }, [filteredGraph, layoutDirection, layoutEpoch, reactFlowInstance, setNodes, setEdges]);

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
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.15}
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

        {/* Top Floating Breadcrumbs Bar */}
        <Panel position="top-left" style={{ margin: '14px 16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '6px 12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              gap: 6,
              fontSize: '0.8rem',
              color: '#475569',
            }}
          >
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                {idx > 0 && <ChevronRight size={13} color="#94a3b8" />}
                <button
                  onClick={() => popBreadcrumb(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: idx === breadcrumbs.length - 1 ? 600 : 400,
                    color: idx === breadcrumbs.length - 1 ? '#0f172a' : '#64748b',
                    backgroundColor: idx === breadcrumbs.length - 1 ? '#f1f5f9' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  className="hover:bg-slate-100 transition-colors"
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </Panel>

        {/* Floating Top-Right Quick Search Bar */}
        <Panel position="top-right" style={{ margin: '14px 16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '4px 10px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              width: 240,
              gap: 6,
            }}
          >
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search entities, fields, methods..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                width: '100%',
                fontSize: '0.78rem',
                color: '#0f172a',
                fontFamily: 'var(--font-sans)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </Panel>

        {/* Floating Canvas Control Toolbar */}
        <Panel position="bottom-center" style={{ marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '6px 10px',
              boxShadow: '0 8px 24px -4px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
              gap: 6,
            }}
          >
            {/* Auto Layout Button */}
            <button
              onClick={triggerAutoLayout}
              title="Auto-organize schema layout"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              className="hover:bg-slate-50 transition-colors"
            >
              <Sparkles size={14} color="#3b82f6" />
              Auto Layout
            </button>

            {/* Layout Direction Toggle */}
            <button
              onClick={() => setLayoutDirection(layoutDirection === 'LR' ? 'TB' : 'LR')}
              title={`Switch to ${layoutDirection === 'LR' ? 'Vertical (Top to Bottom)' : 'Horizontal (Left to Right)'} layout`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
              className="hover:bg-slate-50 transition-colors"
            >
              <LayoutGrid size={14} color="#64748b" />
              {layoutDirection === 'LR' ? 'Horizontal' : 'Vertical'}
            </button>

            <div style={{ width: 1, height: 20, backgroundColor: '#e2e8f0', margin: '0 4px' }} />

            {/* Zoom In */}
            <button
              onClick={() => reactFlowInstance.zoomIn({ duration: 300 })}
              title="Zoom in"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                background: 'none',
                color: '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              className="hover:bg-slate-100 transition-colors"
            >
              <ZoomIn size={15} />
            </button>

            {/* Zoom Out */}
            <button
              onClick={() => reactFlowInstance.zoomOut({ duration: 300 })}
              title="Zoom out"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                background: 'none',
                color: '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              className="hover:bg-slate-100 transition-colors"
            >
              <ZoomOut size={15} />
            </button>

            {/* Fit View */}
            <button
              onClick={() => reactFlowInstance.fitView({ padding: 0.25, duration: 400 })}
              title="Fit all entities in view"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                background: 'none',
                color: '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              className="hover:bg-slate-100 transition-colors"
            >
              <Maximize2 size={15} />
            </button>

            <div style={{ width: 1, height: 20, backgroundColor: '#e2e8f0', margin: '0 4px' }} />

            {/* Toggle Edge Labels */}
            <button
              onClick={toggleEdgeLabels}
              title={showEdgeLabels ? 'Hide relationship labels' : 'Show relationship labels'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: showEdgeLabels ? '#eff6ff' : 'transparent',
                color: showEdgeLabels ? '#2563eb' : '#64748b',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
              className="hover:bg-slate-100 transition-colors"
            >
              {showEdgeLabels ? <Eye size={14} /> : <EyeOff size={14} />}
              Labels
            </button>

            {/* Toggle MiniMap */}
            <button
              onClick={toggleMiniMap}
              title={showMiniMap ? 'Hide MiniMap' : 'Show MiniMap'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: showMiniMap ? '#f1f5f9' : 'transparent',
                color: showMiniMap ? '#0f172a' : '#64748b',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
              className="hover:bg-slate-100 transition-colors"
            >
              <MapPin size={14} />
              MiniMap
            </button>
          </div>
        </Panel>

        {/* Clean Light-Themed MiniMap */}
        {showMiniMap && (
          <MiniMap
            nodeColor={(n) => {
              if (n.id === selectedNodeId) return '#3b82f6';
              return '#cbd5e1';
            }}
            nodeStrokeColor="#ffffff"
            nodeStrokeWidth={2}
            maskColor="rgba(248, 250, 252, 0.7)"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              bottom: 16,
              left: 16,
              width: 160,
              height: 110,
            }}
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
