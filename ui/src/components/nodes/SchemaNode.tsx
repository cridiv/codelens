import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Node, SchemaMember } from '../../types/graph';
import { useStore } from '../../store/useStore';
import { 
  Boxes, 
  FileCode2, 
  Cpu, 
  FunctionSquare, 
  Key, 
  Hash, 
  Layers, 
  ArrowRight,
  ExternalLink,
  FolderOpen
} from 'lucide-react';

interface SchemaNodeData {
  node: Node;
  isExternal?: boolean;
  externalSourcePath?: string;
}

const getKindBadge = (kind: string) => {
  switch (kind) {
    case 'type':
    case 'table':
      return {
        label: 'STRUCT / ENTITY',
        bg: '#ecfdf5',
        color: '#059669',
        border: '#a7f3d0',
        icon: <Boxes size={13} className="text-emerald-600" />,
      };
    case 'interface':
      return {
        label: 'INTERFACE',
        bg: '#fffbeb',
        color: '#d97706',
        border: '#fde68a',
        icon: <Layers size={13} className="text-amber-600" />,
      };
    case 'package':
      return {
        label: 'PACKAGE',
        bg: '#eef2ff',
        color: '#4f46e5',
        border: '#c7d2fe',
        icon: <Boxes size={13} className="text-indigo-600" />,
      };
    case 'file':
      return {
        label: 'FILE',
        bg: '#f5f3ff',
        color: '#7c3aed',
        border: '#ddd6fe',
        icon: <FileCode2 size={13} className="text-purple-600" />,
      };
    case 'function':
      return {
        label: 'FUNCTION',
        bg: '#f0fdf4',
        color: '#16a34a',
        border: '#bbf7d0',
        icon: <FunctionSquare size={13} className="text-green-600" />,
      };
    default:
      return {
        label: kind.toUpperCase(),
        bg: '#f8fafc',
        color: '#475569',
        border: '#e2e8f0',
        icon: <Cpu size={13} className="text-slate-600" />,
      };
  }
};

export const SchemaNode = memo(({ data, selected }: NodeProps<SchemaNodeData>) => {
  const { node, isExternal } = data;
  const { 
    selectedNodeId, 
    hoveredNodeId, 
    selectNode, 
    setHoveredNode,
    setActiveFile,
    activeFilePath,
    graph
  } = useStore();

  const isCurrentSelected = selectedNodeId === node.id || selected;
  const isHovered = hoveredNodeId === node.id;

  // Check if this node is a connected neighbor to the selected/hovered node
  const isConnected = React.useMemo(() => {
    const focusId = hoveredNodeId || selectedNodeId;
    if (!focusId || focusId === node.id) return false;

    return graph.edges.some(
      (e) =>
        (e.from === focusId && e.to === node.id) ||
        (e.to === focusId && e.from === node.id)
    );
  }, [selectedNodeId, hoveredNodeId, node.id, graph.edges]);

  const badge = getKindBadge(node.kind);
  const members = node.members || [];
  const isDifferentFile = activeFilePath && node.path && node.path !== activeFilePath;

  return (
    <div
      className={`schema-node-card ${isCurrentSelected ? 'is-selected' : ''} ${isConnected ? 'is-connected' : ''} ${isHovered ? 'is-hovered' : ''} ${isExternal ? 'is-external-ref' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        selectNode(node.id);
      }}
      onMouseEnter={() => setHoveredNode(node.id)}
      onMouseLeave={() => setHoveredNode(null)}
      style={{
        width: 320,
        backgroundColor: isExternal ? '#fcfdfd' : '#ffffff',
        borderRadius: '10px',
        border: isCurrentSelected 
          ? '2px solid #3b82f6' 
          : isConnected 
          ? '2px solid #10b981' 
          : isExternal
          ? '1.5px dashed #cbd5e1'
          : '1px solid #e2e8f0',
        boxShadow: isCurrentSelected
          ? '0 10px 25px -3px rgba(59, 130, 246, 0.2), 0 4px 6px -4px rgba(59, 130, 246, 0.1)'
          : isConnected
          ? '0 10px 25px -3px rgba(16, 185, 129, 0.15)'
          : isExternal
          ? '0 2px 6px rgba(0, 0, 0, 0.02)'
          : '0 4px 12px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {/* Target Connection Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        style={{
          width: 10,
          height: 10,
          backgroundColor: isCurrentSelected ? '#3b82f6' : isExternal ? '#94a3b8' : '#64748b',
          border: '2px solid #ffffff',
          borderRadius: '50%',
          left: -6,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
        }}
      />

      {/* Target Connection Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        style={{
          width: 8,
          height: 8,
          backgroundColor: '#94a3b8',
          border: '2px solid #ffffff',
          borderRadius: '50%',
          top: -5,
        }}
      />

      {/* External Reference Banner */}
      {isExternal && (
        <div
          style={{
            backgroundColor: '#f1f5f9',
            padding: '4px 10px',
            borderTopLeftRadius: '9px',
            borderTopRightRadius: '9px',
            borderBottom: '1px dashed #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.65rem',
            color: '#475569',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <ExternalLink size={11} color="#64748b" />
            EXTERNAL REFERENCE
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveFile(node.path);
            }}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              padding: '1px 6px',
              fontSize: '0.62rem',
              color: '#2563eb',
              cursor: 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            title="Open this file's schema"
          >
            <FolderOpen size={10} />
            Jump to file
          </button>
        </div>
      )}

      {/* Node Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid #f1f5f9',
          background: isExternal
            ? '#fafafa'
            : 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',
          borderTopLeftRadius: isExternal ? '0px' : '9px',
          borderTopRightRadius: isExternal ? '0px' : '9px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: badge.color,
              backgroundColor: badge.bg,
              border: `1px solid ${badge.border}`,
              padding: '2px 6px',
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {badge.icon}
            {badge.label}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isDifferentFile && !isExternal && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveFile(node.path);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Switch file schema view"
              >
                <FolderOpen size={13} />
              </button>
            )}
            <span
              style={{
                fontSize: '0.68rem',
                color: '#64748b',
                backgroundColor: '#f1f5f9',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: 500,
              }}
            >
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h3
            style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#0f172a',
              margin: 0,
              letterSpacing: '-0.01em',
              fontFamily: 'var(--font-mono), monospace',
            }}
          >
            {node.name}
          </h3>
        </div>

        {node.path && (
          <div
            style={{
              fontSize: '0.7rem',
              color: '#64748b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'var(--font-mono), monospace',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={node.path}
          >
            <FileCode2 size={11} color="#94a3b8" />
            <span>{node.path}</span>
          </div>
        )}
      </div>

      {/* Schema Columns / Members List */}
      <div
        style={{
          padding: '6px 0',
          maxHeight: isExternal ? 160 : 260,
          overflowY: 'auto',
        }}
      >
        {members.length > 0 ? (
          members.map((member: SchemaMember, idx: number) => {
            const isPK = member.type.includes('[PK]');
            const isFK = member.type.includes('[FK');
            const isUnique = member.type.includes('[UNIQUE]');
            const isMethod = member.kind === 'method' || member.name.includes('(');

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 14px',
                  fontSize: '0.74rem',
                  fontFamily: 'var(--font-mono), monospace',
                  borderBottom: idx < members.length - 1 ? '1px solid #f8fafc' : 'none',
                  backgroundColor: isCurrentSelected ? '#fbfcfe' : 'transparent',
                }}
                className="schema-member-row"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {isPK ? (
                    <Key size={12} color="#f59e0b" style={{ flexShrink: 0 }} />
                  ) : isFK ? (
                    <ArrowRight size={12} color="#3b82f6" style={{ flexShrink: 0 }} />
                  ) : isMethod ? (
                    <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.68rem' }}>fn</span>
                  ) : (
                    <Hash size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
                  )}

                  <span
                    style={{
                      fontWeight: isPK || isMethod ? 600 : 500,
                      color: isPK ? '#0f172a' : isMethod ? '#1e293b' : '#334155',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={member.name}
                  >
                    {member.name}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '0.66rem',
                    color: isPK ? '#b45309' : isFK ? '#2563eb' : isUnique ? '#7c3aed' : '#64748b',
                    backgroundColor: isPK
                      ? '#fef3c7'
                      : isFK
                      ? '#eff6ff'
                      : isUnique
                      ? '#f5f3ff'
                      : '#f8fafc',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    marginLeft: 8,
                    fontWeight: 500,
                  }}
                  title={member.type}
                >
                  {member.type}
                </div>
              </div>
            );
          })
        ) : (
          <div
            style={{
              padding: '10px 14px',
              fontSize: '0.72rem',
              color: '#94a3b8',
              fontStyle: 'italic',
            }}
          >
            No declared properties or methods
          </div>
        )}
      </div>

      {/* Card Footer */}
      {node.metadata?.doc && (
        <div
          style={{
            padding: '6px 14px',
            borderTop: '1px solid #f1f5f9',
            backgroundColor: '#fafafa',
            borderBottomLeftRadius: '9px',
            borderBottomRightRadius: '9px',
            fontSize: '0.66rem',
            color: '#64748b',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {node.metadata.doc}
        </div>
      )}

      {/* Source Connection Handle (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        style={{
          width: 10,
          height: 10,
          backgroundColor: isCurrentSelected ? '#3b82f6' : isExternal ? '#94a3b8' : '#64748b',
          border: '2px solid #ffffff',
          borderRadius: '50%',
          right: -6,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
        }}
      />

      {/* Source Connection Handle (Bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        style={{
          width: 8,
          height: 8,
          backgroundColor: '#94a3b8',
          border: '2px solid #ffffff',
          borderRadius: '50%',
          bottom: -5,
        }}
      />
    </div>
  );
});

SchemaNode.displayName = 'SchemaNode';
