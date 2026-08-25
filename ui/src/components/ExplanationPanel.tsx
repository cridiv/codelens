import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import {
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';

export const ExplanationPanel: React.FC = () => {
  const { graph, selectedNodeId } = useStore();
  const [copied, setCopied] = useState(false);

  const selectedNode = React.useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graph.nodes]);

  const handleCopyExplanation = () => {
    if (!selectedNode) return;
    const text = `Component: ${selectedNode.name} (${selectedNode.kind})\nPackage: ${selectedNode.metadata?.package || 'root'}\nPath: ${selectedNode.path}\n\n1. High-Level Intuition\n${selectedNode.name} serves as the primary component for its domain within the system architecture.\n\n2. Purpose\n${selectedNode.metadata?.doc || 'Enforces business invariants and coordinates data flow between layers.'}\n\n3. Dependencies\nCoupled to package ${selectedNode.metadata?.package || 'main'}.`;
    navigator.clipboard?.writeText?.(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!selectedNode) {
    return (
      <aside
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#ffffff',
          borderLeft: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          color: '#94a3b8',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            backgroundColor: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem',
          }}
        >
          <Sparkles size={24} color="#94a3b8" />
        </div>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
          AI Explanation
        </h4>
        <p style={{ fontSize: '0.78rem', lineHeight: 1.5, maxWidth: 220 }}>
          Select any entity on the canvas or sidebar to generate an architectural explanation.
        </p>
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}
    >
      {/* Entity Header */}
      <div
        style={{
          padding: '14px 16px 12px 16px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          backgroundColor: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: '#059669',
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                padding: '2px 6px',
                borderRadius: '4px',
                textTransform: 'uppercase',
              }}
            >
              {selectedNode.kind}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                color: '#64748b',
                fontFamily: 'var(--font-mono), monospace',
              }}
            >
              pkg/{selectedNode.metadata?.package || 'root'}
            </span>
          </div>

          <button
            onClick={handleCopyExplanation}
            title="Copy explanation"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              fontSize: '0.7rem',
              fontWeight: 500,
            }}
            className="hover:bg-slate-50 transition-colors"
          >
            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <h3
          style={{
            fontSize: '1.05rem',
            fontWeight: 700,
            color: '#0f172a',
            fontFamily: 'var(--font-mono), monospace',
            margin: '2px 0',
          }}
        >
          {selectedNode.name}
        </h3>

        <div
          style={{
            fontSize: '0.72rem',
            color: '#64748b',
            fontFamily: 'var(--font-mono), monospace',
            wordBreak: 'break-all',
          }}
        >
          {selectedNode.path}
        </div>
      </div>

      {/* AI Explanation Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Layer 1: High-level Intuition */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 14px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#0f172a',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: '#2563eb' }}>1.</span> High-Level Intuition
          </div>
          <p style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.55, margin: 0 }}>
            <strong>{selectedNode.name}</strong> acts as the central component for its domain within the system architecture. It encapsulates core logic, manages internal state, and exposes clean abstractions so consumers don&apos;t need to deal with low-level implementation details.
          </p>
        </div>

        {/* Layer 2: Purpose in System */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 14px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#0f172a',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: '#2563eb' }}>2.</span> Purpose in System
          </div>
          <p style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.55, margin: 0 }}>
            {selectedNode.metadata?.doc || `Enforces business invariants, coordinates data flow between layers, and provides transactional integrity across API requests.`}
          </p>
        </div>

        {/* Layer 3: How it Works */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 14px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#0f172a',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: '#2563eb' }}>3.</span> How It Works
          </div>
          <ul
            style={{
              fontSize: '0.8rem',
              color: '#334155',
              lineHeight: 1.55,
              paddingLeft: 18,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <li>Validates caller arguments and ensures context is uncancelled.</li>
            <li>Executes core domain logic and coordinates with subordinate stores or helpers.</li>
            <li>Constructs immutable response types and handles failures gracefully with error wrapping.</li>
          </ul>
        </div>

        {/* Layer 4: Dependencies */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 14px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#0f172a',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: '#2563eb' }}>4.</span> Dependencies & Interactions
          </div>
          <p style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.55, margin: 0 }}>
            Coupled to package <code>{selectedNode.metadata?.package || 'main'}</code>. Receives requests from upper routing and service layers, and delegates persistent state down to database repositories.
          </p>
        </div>

        {/* Layer 5: Code-Level Detail */}
        {selectedNode.metadata?.signature && (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#0f172a',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ color: '#2563eb' }}>5.</span> Code-Level Detail
            </div>
            <code
              style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono), monospace',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '8px 10px',
                display: 'block',
                color: '#0f172a',
                overflowX: 'auto',
              }}
            >
              {selectedNode.metadata.signature}
            </code>
          </div>
        )}
      </div>
    </aside>
  );
};
