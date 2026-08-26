import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Sparkles, Copy, Check, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExplainResponse {
  explanation: string;
}

interface Section {
  number: string;
  title: string;
  content: string;
}

// ── Section parser ────────────────────────────────────────────────────────────
// Splits the LLM's numbered-section response into structured data.
// Falls back gracefully if the model returns a different format.

function parseSections(text: string): Section[] {
  const titles = [
    'High-Level Intuition',
    'Purpose',
    'How It Works',
    'Dependencies',
    'Code-Level Detail',
  ];

  const sections: Section[] = [];
  const lines = text.split('\n');
  let current: Section | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (current) {
      current.content = bodyLines.join('\n').trim();
      sections.push(current);
      bodyLines = [];
    }
  };

  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s+(.+)/);
    if (match) {
      flush();
      current = { number: match[1], title: match[2].replace(/[*_]/g, ''), content: '' };
    } else if (current) {
      bodyLines.push(line);
    }
  }
  flush();

  // Fallback: if parsing failed just return a single blob
  if (sections.length === 0) {
    return titles.map((t, i) => ({ number: String(i + 1), title: t, content: '' })).concat([
      { number: '0', title: 'Full Explanation', content: text },
    ]);
  }

  return sections;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ExplanationPanel: React.FC = () => {
  const { graph, selectedNodeId } = useStore();
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastFetchedId, setLastFetchedId] = useState<string | null>(null);

  const selectedNode = React.useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graph.nodes]);

  // Fetch explanation whenever the selected node changes
  useEffect(() => {
    if (!selectedNodeId || selectedNodeId === lastFetchedId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setExplanation(null);

    fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: selectedNodeId }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((e: { error?: string }) => { throw new Error(e.error || `HTTP ${res.status}`); });
        return res.json() as Promise<ExplainResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setExplanation(data.explanation);
          setLastFetchedId(selectedNodeId);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedNodeId, lastFetchedId]);

  const handleCopy = () => {
    if (!explanation) return;
    navigator.clipboard?.writeText?.(explanation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = () => {
    setLastFetchedId(null); // clears the guard → triggers re-fetch
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!selectedNode) {
    return (
      <aside style={panelStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <Sparkles size={24} color="#94a3b8" />
          </div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>AI Explanation</h4>
          <p style={{ fontSize: '0.78rem', lineHeight: 1.5, maxWidth: 220 }}>
            Select any node on the canvas or sidebar to generate an architectural explanation.
          </p>
        </div>
      </aside>
    );
  }

  const sections = explanation ? parseSections(explanation) : [];

  return (
    <aside style={panelStyle}>
      {/* ── Node header ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <KindBadge kind={selectedNode.kind} />
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
              pkg/{selectedNode.metadata?.package || 'root'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {explanation && (
              <IconButton onClick={handleRefresh} title="Re-generate">
                <RefreshCw size={12} />
              </IconButton>
            )}
            <IconButton onClick={handleCopy} title="Copy explanation" disabled={!explanation}>
              {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              <span style={{ fontSize: '0.7rem' }}>{copied ? 'Copied' : 'Copy'}</span>
            </IconButton>
          </div>
        </div>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', margin: '2px 0' }}>
          {selectedNode.name}
        </h3>
        <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {selectedNode.path}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '2rem 0', color: '#64748b' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} color="#2563eb" />
            <p style={{ fontSize: '0.8rem', margin: 0 }}>Generating explanation…</p>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>DeepSeek is reading your codebase</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '1rem', backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>
              <AlertCircle size={14} />
              Explanation failed
            </div>
            <p style={{ fontSize: '0.75rem', color: '#7f1d1d', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>{error}</p>
            <button onClick={handleRefresh} style={{ alignSelf: 'flex-start', fontSize: '0.75rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Try again →
            </button>
          </div>
        )}

        {/* Rendered sections from LLM */}
        {!loading && sections.map((s) => (
          <ExplanationSection key={s.number} section={s} />
        ))}

        {/* Signature block (always shown at bottom if available) */}
        {!loading && selectedNode.metadata?.signature && (
          <div style={cardStyle}>
            <SectionHeader number={sections.length > 0 ? '' : '5'} title="Signature" />
            <code style={{ fontSize: '0.75rem', fontFamily: 'monospace', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', display: 'block', color: '#0f172a', overflowX: 'auto' }}>
              {selectedNode.metadata.signature}
            </code>
          </div>
        )}
      </div>

      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </aside>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const ExplanationSection: React.FC<{ section: Section }> = ({ section }) => (
  <div style={cardStyle}>
    <SectionHeader number={section.number} title={section.title} />
    <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
      {section.content || <span style={{ color: '#94a3b8' }}>No detail provided.</span>}
    </div>
  </div>
);

const SectionHeader: React.FC<{ number: string; title: string }> = ({ number, title }) => (
  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
    {number && <span style={{ color: '#2563eb' }}>{number}.</span>}
    {title}
  </div>
);

const KindBadge: React.FC<{ kind: string }> = ({ kind }) => (
  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#059669', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
    {kind}
  </span>
);

const IconButton: React.FC<{ onClick: () => void; title: string; disabled?: boolean; children: React.ReactNode }> = ({ onClick, title, disabled, children }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: disabled ? 'default' : 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '0.7rem', fontWeight: 500, opacity: disabled ? 0.4 : 1 }}
  >
    {children}
  </button>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  backgroundColor: '#ffffff',
  display: 'flex',
  flexDirection: 'column',
  borderLeft: '1px solid #e2e8f0',
  overflow: 'hidden',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 14px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
};
