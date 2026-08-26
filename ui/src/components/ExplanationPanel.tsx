import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Sparkles, Copy, Check, RefreshCw, AlertCircle, Loader2, BookOpen, Lightbulb, Code2, Network, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';

interface ExplainResponse {
  explanation: string;
}

interface Section {
  number: string;
  title: string;
  content: string;
  icon?: React.ReactNode;
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  '1': <BookOpen size={14} className="text-blue-500" />,
  '2': <Lightbulb size={14} className="text-amber-500" />,
  '3': <Code2 size={14} className="text-emerald-500" />,
  '4': <Network size={14} className="text-purple-500" />,
  '5': <ShieldAlert size={14} className="text-rose-500" />,
};

function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split('\n');
  let current: Section | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (current) {
      current.content = bodyLines.join('\n').trim();
      current.icon = SECTION_ICONS[current.number] || <Sparkles size={14} className="text-blue-500" />;
      sections.push(current);
      bodyLines = [];
    }
  };

  for (const line of lines) {
    const match = line.match(/^#*\s*(\d+)\.\s+(.+)/);
    if (match) {
      flush();
      current = {
        number: match[1],
        title: match[2].replace(/[*_#]/g, '').trim(),
        content: '',
      };
    } else if (current) {
      bodyLines.push(line);
    }
  }
  flush();

  if (sections.length === 0) {
    return [
      {
        number: '1',
        title: 'Architectural Overview',
        content: text,
        icon: <BookOpen size={14} className="text-blue-500" />,
      },
    ];
  }

  return sections;
}

export const ExplanationPanel: React.FC = () => {
  const { graph, selectedNodeId } = useStore();
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastFetchedId, setLastFetchedId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const selectedNode = React.useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graph.nodes]);

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
        if (!res.ok) {
          return res.json().then((e: { error?: string }) => {
            throw new Error(e.error || `HTTP ${res.status}`);
          });
        }
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

    return () => {
      cancelled = true;
    };
  }, [selectedNodeId, lastFetchedId]);

  const handleCopy = () => {
    if (!explanation) return;
    navigator.clipboard?.writeText?.(explanation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = () => {
    setLastFetchedId(null);
  };

  const toggleSection = (number: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [number]: !prev[number],
    }));
  };

  if (!selectedNode) {
    return (
      <aside className="w-full h-full bg-slate-900 border-l border-slate-800 flex flex-col items-center justify-center p-8 text-center text-slate-400 select-none">
        <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-4 shadow-inner">
          <Sparkles size={22} className="text-blue-400" />
        </div>
        <h4 className="text-sm font-semibold text-slate-200 mb-1">Architecture Explainer</h4>
        <p className="text-xs text-slate-400 max-w-[240px] leading-relaxed">
          Select any node in the graph or hierarchy tree to get a structured Kleppmann-style architectural explanation.
        </p>
      </aside>
    );
  }

  const sections = explanation ? parseSections(explanation) : [];

  return (
    <aside className="w-full h-full bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden select-text">
      {/* ── Sticky Header ──────────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md flex-shrink-0 z-10">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              {selectedNode.kind}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              pkg/{selectedNode.metadata?.package || 'root'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {explanation && (
              <button
                onClick={handleRefresh}
                title="Regenerate explanation"
                className="p-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/60 rounded-md transition-colors"
              >
                <RefreshCw size={12} />
              </button>
            )}
            <button
              onClick={handleCopy}
              disabled={!explanation}
              title="Copy markdown"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700/80 disabled:opacity-40 border border-slate-700/60 rounded-md transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <h3 className="text-base font-bold text-slate-100 font-mono truncate" title={selectedNode.name}>
          {selectedNode.name}
        </h3>
        <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5" title={selectedNode.path}>
          {selectedNode.path}
        </p>
      </div>

      {/* ── Scrollable Body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <Loader2 size={26} className="animate-spin text-blue-400" />
            <div className="text-center">
              <p className="text-xs font-medium text-slate-200">Analyzing architecture…</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Synthesizing systems context via Llama 70B</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold">
              <AlertCircle size={14} />
              <span>Explanation generation failed</span>
            </div>
            <p className="text-[11px] text-rose-300 font-mono break-all leading-relaxed">{error}</p>
            <button
              onClick={handleRefresh}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 underline inline-block pt-1"
            >
              Retry explanation →
            </button>
          </div>
        )}

        {/* Structured Sections */}
        {!loading && sections.map((sec) => {
          const isCollapsed = collapsedSections[sec.number];
          return (
            <div
              key={sec.number}
              className="bg-slate-950/60 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm transition-all duration-200"
            >
              <button
                onClick={() => toggleSection(sec.number)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 bg-slate-900/60 hover:bg-slate-800/50 text-left border-b border-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {sec.icon}
                  <span className="text-xs font-semibold text-slate-200 tracking-wide">
                    {sec.number}. {sec.title}
                  </span>
                </div>
                {isCollapsed ? <ChevronRight size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
              </button>

              {!isCollapsed && (
                <div className="p-3.5 text-xs text-slate-300 leading-relaxed space-y-2 whitespace-pre-wrap font-sans">
                  {renderFormattedContent(sec.content)}
                </div>
              )}
            </div>
          );
        })}

        {/* Signature Card */}
        {!loading && selectedNode.metadata?.signature && (
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <Code2 size={12} className="text-emerald-400" />
              <span>Type Signature</span>
            </div>
            <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto whitespace-pre">
              {selectedNode.metadata.signature}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};

function renderFormattedContent(content: string) {
  if (!content) {
    return <span className="text-slate-500 italic">No details available.</span>;
  }

  // Simple clean formatting for bullets, bold text, inline code
  const paragraphs = content.split('\n\n');
  return paragraphs.map((para, idx) => {
    // If paragraph contains code block
    if (para.startsWith('```')) {
      const cleaned = para.replace(/^```[a-z]*\n?/, '').replace(/```$/, '');
      return (
        <pre key={idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-blue-300 overflow-x-auto whitespace-pre my-2">
          {cleaned}
        </pre>
      );
    }

    return (
      <p key={idx} className="text-slate-300 leading-relaxed text-[12px]">
        {para}
      </p>
    );
  });
}
