import React from 'react';
import { useStore } from '../store/useStore';
import {
  Boxes,
  FolderGit2,
  PanelLeft,
  PanelRight,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    graph,
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

        {/* Active Repo Path Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '3px 10px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: '#475569',
            fontFamily: 'var(--font-mono), monospace',
          }}
        >
          <FolderGit2 size={13} color="#64748b" />
          <span>current-workspace</span>
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
