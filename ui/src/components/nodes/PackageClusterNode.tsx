import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { useStore } from '../../store/useStore';
import { Boxes, FileCode2, ArrowRight, Layers, Sparkles } from 'lucide-react';

export interface PackageClusterNodeData {
  packageName: string;
  totalEntities: number;
  totalFiles: number;
  typesCount: number;
  functionsCount: number;
  interfacesCount: number;
  topSymbols: { name: string; kind: string }[];
  inboundCalls: number;
  outboundCalls: number;
}

export const PackageClusterNode = memo(({ data, selected }: NodeProps<PackageClusterNodeData>) => {
  const {
    packageName,
    totalEntities,
    totalFiles,
    typesCount,
    functionsCount,
    interfacesCount,
    topSymbols = [],
  } = data;

  const { setActivePackage, setScopeMode, selectedNodeId, selectNode } = useStore();
  const isSelected = selectedNodeId === `pkg:${packageName}` || selected;

  const handleOpenPackage = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(`pkg:${packageName}`);
    setActivePackage(packageName);
    setScopeMode('package');
  };

  return (
    <div
      onClick={() => selectNode(`pkg:${packageName}`)}
      onDoubleClick={handleOpenPackage}
      style={{
        width: 320,
        backgroundColor: '#ffffff',
        border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
        borderRadius: '12px',
        boxShadow: isSelected
          ? '0 10px 25px -3px rgba(37, 99, 235, 0.2), 0 4px 6px -4px rgba(37, 99, 235, 0.1)'
          : '0 4px 12px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: 'var(--font-sans)',
      }}
      className="hover:border-blue-400 hover:shadow-lg transition-all"
    >
      {/* Target Handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 8,
          height: 8,
          backgroundColor: '#3b82f6',
          border: '2px solid #ffffff',
        }}
      />
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 8,
          height: 8,
          backgroundColor: '#3b82f6',
          border: '2px solid #ffffff',
        }}
      />

      {/* Header Banner */}
      <div
        style={{
          padding: '12px 14px',
          backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '8px',
              backgroundColor: '#e0e7ff',
              color: '#4338ca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #c7d2fe',
            }}
          >
            <Boxes size={16} />
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              PACKAGE CLUSTER
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
              pkg/{packageName}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            color: '#334155',
            padding: '2px 8px',
            borderRadius: '12px',
          }}
        >
          {totalEntities} items
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div
        style={{
          padding: '8px 14px',
          backgroundColor: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          color: '#64748b',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <FileCode2 size={12} color="#7c3aed" />
          <strong>{totalFiles}</strong> {totalFiles === 1 ? 'file' : 'files'}
        </span>
        {typesCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Layers size={12} color="#059669" />
            <strong>{typesCount}</strong> structs
          </span>
        )}
        {interfacesCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Boxes size={12} color="#d97706" />
            <strong>{interfacesCount}</strong> ifaces
          </span>
        )}
        {functionsCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={12} color="#2563eb" />
            <strong>{functionsCount}</strong> funcs
          </span>
        )}
      </div>

      {/* Top Exported Entities List */}
      {topSymbols.length > 0 && (
        <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: '#fcfcfd' }}>
          <div style={{ fontSize: '0.64rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>
            Key Components:
          </div>
          {topSymbols.slice(0, 4).map((sym, idx) => (
            <div
              key={idx}
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 210 }}>
                {sym.name}
              </span>
              <span
                style={{
                  fontSize: '0.6rem',
                  color: sym.kind === 'interface' ? '#d97706' : sym.kind === 'type' ? '#059669' : '#2563eb',
                  backgroundColor: '#f1f5f9',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  textTransform: 'uppercase',
                }}
              >
                {sym.kind}
              </span>
            </div>
          ))}
          {topSymbols.length > 4 && (
            <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>
              +{topSymbols.length - 4} more entities in package…
            </div>
          )}
        </div>
      )}

      {/* Drilldown Action Footer */}
      <button
        onClick={handleOpenPackage}
        style={{
          width: '100%',
          padding: '8px 14px',
          backgroundColor: '#fafafa',
          borderTop: '1px solid #e2e8f0',
          borderLeft: 'none',
          borderRight: 'none',
          borderBottom: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          fontSize: '0.72rem',
          fontWeight: 600,
          color: '#2563eb',
          transition: 'all 0.15s ease',
        }}
        className="hover:bg-blue-50 hover:text-blue-700"
      >
        <span>Open Package Schema View</span>
        <ArrowRight size={13} />
      </button>

      {/* Source Handles */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 8,
          height: 8,
          backgroundColor: '#2563eb',
          border: '2px solid #ffffff',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 8,
          height: 8,
          backgroundColor: '#2563eb',
          border: '2px solid #ffffff',
        }}
      />
    </div>
  );
});

PackageClusterNode.displayName = 'PackageClusterNode';
