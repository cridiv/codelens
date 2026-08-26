import React from 'react';
import { useStore } from '../store/useStore';
import {
  Boxes,
  FileCode2,
  LayoutGrid,
  PanelLeft,
  PanelRight,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    graph,
    scopeMode,
    setScopeMode,
    selectNode,
    activePackage,
    setActivePackage,
    activeFilePath,
    setActiveFile,
    isLeftPanelOpen,
    toggleLeftPanel,
    isRightPanelOpen,
    toggleRightPanel,
  } = useStore();

  return (
    <header
      style={{
        height: 52,
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 20,
      }}
    >
      {/* Left Brand & Sidebar Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={toggleLeftPanel}
          title={isLeftPanelOpen ? 'Hide Left Sidebar' : 'Show Left Sidebar'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 6,
            color: isLeftPanelOpen ? '#2563eb' : '#64748b',
            backgroundColor: isLeftPanelOpen ? '#eff6ff' : 'transparent',
            display: 'flex',
            alignItems: 'center',
          }}
          className="hover:bg-slate-100 transition-colors"
        >
          <PanelLeft size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
            }}
          >
            <Boxes size={16} />
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: '1rem',
                color: '#0f172a',
                letterSpacing: '-0.02em',
              }}
            >
              CodeLens
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: '#2563eb',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                padding: '1px 6px',
                borderRadius: '4px',
                letterSpacing: '0.04em',
              }}
            >
              SCHEMA VISUALIZER
            </span>
          </div>
        </div>

        {/* Scope Mode Segmented Control in Navbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#f1f5f9',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '3px',
            gap: 2,
          }}
        >
          <button
            onClick={() => {
              setScopeMode('all');
              selectNode(null);
            }}
            title="Full Codebase Overview"
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: scopeMode === 'all' ? '#2563eb' : 'transparent',
              color: scopeMode === 'all' ? '#ffffff' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s ease',
              boxShadow: scopeMode === 'all' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
            }}
          >
            <LayoutGrid size={13} />
            <span>CodeOverview</span>
          </button>

          <button
            onClick={() => {
              const pkg = activePackage || (graph.nodes[0]?.metadata?.package) || 'root';
              setActivePackage(pkg);
            }}
            title="Package View"
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: scopeMode === 'package' ? '#2563eb' : 'transparent',
              color: scopeMode === 'package' ? '#ffffff' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s ease',
              boxShadow: scopeMode === 'package' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
            }}
          >
            <Boxes size={13} />
            <span>Package View</span>
          </button>

          <button
            onClick={() => {
              if (activeFilePath) {
                setScopeMode('file');
              } else {
                const firstFile = graph.nodes.find((n) => n.path)?.path;
                if (firstFile) setActiveFile(firstFile);
              }
            }}
            title="File Schema"
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: scopeMode === 'file' ? '#2563eb' : 'transparent',
              color: scopeMode === 'file' ? '#ffffff' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s ease',
              boxShadow: scopeMode === 'file' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
            }}
          >
            <FileCode2 size={13} />
            <span>File Schema</span>
          </button>
        </div>
      </div>

      {/* Center Stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.75rem', color: '#64748b' }}>
        <span>
          <strong style={{ color: '#0f172a' }}>{graph.nodes.length}</strong> Entities
        </span>
        <span style={{ color: '#cbd5e1' }}>&bull;</span>
        <span>
          <strong style={{ color: '#0f172a' }}>{graph.edges.length}</strong> Relationships
        </span>
      </div>

      {/* Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={toggleRightPanel}
          title={isRightPanelOpen ? 'Hide Right Inspector' : 'Show Right Inspector'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 6,
            color: isRightPanelOpen ? '#2563eb' : '#64748b',
            backgroundColor: isRightPanelOpen ? '#eff6ff' : 'transparent',
            display: 'flex',
            alignItems: 'center',
          }}
          className="hover:bg-slate-100 transition-colors"
        >
          <PanelRight size={18} />
        </button>
      </div>
    </header>
  );
};
