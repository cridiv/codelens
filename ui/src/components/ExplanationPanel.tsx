import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../store/useStore';
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Loader2,
  FileCode2,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Boxes,
  Layers,
  GraduationCap,
  LogIn,
  LogOut,
  HelpCircle,
  Send,
  User,
  Bot,
} from 'lucide-react';

interface ExplainResponse {
  explanation: string;
}

interface ChatResponse {
  answer: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Section {
  number: string;
  title: string;
  content: string;
}

function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split('\n');
  let current: Section | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (current) {
      current.content = bodyLines.join('\n').trim();
      if (current.content) {
        sections.push(current);
      }
      bodyLines = [];
    }
  };

  for (const line of lines) {
    const match = line.match(/^(?:#+\s*)?(?:\*\*)?(\d+)\.\s*(?:\*\*)?\s*([^\n*#]+?)(?:\*\*)?$/);
    if (match && match[2].trim().length > 0 && match[2].trim().length < 80) {
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
        title: 'Architectural Breakdown',
        content: text,
      },
    ];
  }

  return sections;
}

// ── Plain English Semantic Helper ─────────────────────────────────────────────

function derivePlainEnglishSpec(node: ReturnType<typeof useStore.getState>['graph']['nodes'][0]) {
  const sig = node.metadata?.signature || '';
  const doc = node.metadata?.doc || '';
  const name = node.name;
  const kind = node.kind;

  let paramsStr = '';
  let returnsStr = '';

  const paramMatch = sig.match(/\(([^()]*)\)\s*(?:\(([^()]*)\)|([^{\n]+))?$/);
  if (paramMatch) {
    const allParens = [...sig.matchAll(/\(([^()]*)\)/g)];
    if (allParens.length >= 2) {
      paramsStr = allParens[1][1];
      if (allParens.length >= 3) {
        returnsStr = allParens[2][1];
      } else {
        const after = sig.split(/\)(?=[^)]*$)/)[1];
        if (after) returnsStr = after.trim();
      }
    } else if (allParens.length === 1) {
      paramsStr = allParens[0][1];
      const after = sig.substring(sig.indexOf(')') + 1).trim();
      returnsStr = after;
    }
  }

  const inputs: { name: string; type: string }[] = [];
  if (paramsStr.trim()) {
    paramsStr.split(',').forEach((p) => {
      const parts = p.trim().split(/\s+/);
      if (parts.length >= 2) {
        inputs.push({ name: parts[0], type: parts.slice(1).join(' ') });
      } else if (parts.length === 1 && parts[0]) {
        inputs.push({ name: 'arg', type: parts[0] });
      }
    });
  }

  const outputs: string[] = [];
  if (returnsStr.trim()) {
    returnsStr.replace(/[()]/g, '').split(',').forEach((r) => {
      const cleaned = r.trim();
      if (cleaned) outputs.push(cleaned);
    });
  }

  let whatItDoes = doc;
  if (!whatItDoes) {
    if (kind === 'function') {
      whatItDoes = `Executes the ${name} operation within the ${node.metadata?.package || 'current'} package.`;
    } else if (kind === 'type' || kind === 'interface') {
      whatItDoes = `Defines the data structure and interface contract for ${name}.`;
    } else if (kind === 'package') {
      whatItDoes = `Encapsulates package-level functionality for ${name}.`;
    } else if (kind === 'file') {
      whatItDoes = `Contains source code and declarations for ${name}.`;
    }
  }

  let whyItExists = `Provides modular, reusable logic to keep the ${node.metadata?.package || 'root'} architecture decoupled and maintainable.`;
  if (kind === 'type') {
    whyItExists = `Serves as the core domain model for representing ${name} across the application.`;
  } else if (kind === 'interface') {
    whyItExists = `Establishes an abstraction boundary so other components can interact with ${name} without depending on concrete implementations.`;
  }

  return {
    whatItDoes,
    whyItExists,
    inputs,
    outputs,
    rawSignature: sig,
  };
}

export const ExplanationPanel: React.FC = () => {
  const { graph, selectedNodeId } = useStore();
  const [explanationCache, setExplanationCache] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTechnicalSpec, setShowTechnicalSpec] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Follow-up Q&A state per node
  const [chatThreads, setChatThreads] = useState<Record<string, ChatMessage[]>>({});
  const [showChatInput, setShowChatInput] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const selectedNode = React.useMemo(() => {
    if (!selectedNodeId) return null;
    return graph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graph.nodes]);

  const neighbors = React.useMemo(() => {
    if (!selectedNodeId) return { callers: [], callees: [], types: [] };
    const callers: string[] = [];
    const callees: string[] = [];
    const types: string[] = [];

    graph.edges.forEach((e) => {
      if (e.kind === 'calls') {
        if (e.to === selectedNodeId) {
          const fromNode = graph.nodes.find((n) => n.id === e.from);
          if (fromNode) callers.push(fromNode.name);
        } else if (e.from === selectedNodeId) {
          const toNode = graph.nodes.find((n) => n.id === e.to);
          if (toNode) callees.push(toNode.name);
        }
      } else if (e.kind === 'implements' || e.kind === 'references') {
        if (e.from === selectedNodeId) {
          const toNode = graph.nodes.find((n) => n.id === e.to);
          if (toNode) types.push(toNode.name);
        }
      }
    });

    return { callers, callees, types };
  }, [selectedNodeId, graph.nodes, graph.edges]);

  const currentExplanation = selectedNodeId ? explanationCache[selectedNodeId] || null : null;
  const currentChatMessages = selectedNodeId ? chatThreads[selectedNodeId] || [] : [];

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchExplanation = (nodeId: string, force = false) => {
    if (!force && explanationCache[nodeId]) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId }),
      signal: controller.signal,
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
        setExplanationCache((prev) => ({
          ...prev,
          [nodeId]: data.explanation,
        }));
        setError(null);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') {
          return;
        }
        setError(err.message || 'Failed to fetch explanation from server.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNodeId || !chatInput.trim() || chatLoading) return;

    const userQuestion = chatInput.trim();
    const history = chatThreads[selectedNodeId] || [];
    const updatedHistory: ChatMessage[] = [
      ...history,
      { role: 'user', content: userQuestion },
    ];

    setChatThreads((prev) => ({
      ...prev,
      [selectedNodeId]: updatedHistory,
    }));
    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: selectedNodeId,
        question: userQuestion,
        history,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((e: { error?: string }) => {
            throw new Error(e.error || `HTTP ${res.status}`);
          });
        }
        return res.json() as Promise<ChatResponse>;
      })
      .then((data) => {
        setChatThreads((prev) => ({
          ...prev,
          [selectedNodeId]: [
            ...updatedHistory,
            { role: 'assistant', content: data.answer },
          ],
        }));
      })
      .catch((err: Error) => {
        setChatError(err.message || 'Failed to get answer from AI.');
      })
      .finally(() => {
        setChatLoading(false);
      });
  };

  const handleCopyExplanation = () => {
    if (!selectedNode) return;
    const plainSpec = derivePlainEnglishSpec(selectedNode);
    const text =
      currentExplanation ||
      `# ${selectedNode.name} (${selectedNode.kind})\n\n` +
      `**What it does:** ${plainSpec.whatItDoes}\n\n` +
      `**Why it exists:** ${plainSpec.whyItExists}\n\n` +
      `**Path:** ${selectedNode.path}\n` +
      `**Signature:** ${selectedNode.metadata?.signature || ''}`;

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
          CodeLens Inspector
        </h4>
        <p style={{ fontSize: '0.78rem', lineHeight: 1.5, maxWidth: 220 }}>
          Select any struct, interface, or function in the schema canvas to explore its plain-English architecture.
        </p>
      </aside>
    );
  }

  const plainSpec = derivePlainEnglishSpec(selectedNode);
  const sections = currentExplanation ? parseSections(currentExplanation) : [];
  const isHighLevel = selectedNode.kind === 'package' || selectedNode.kind === 'file' || selectedNode.kind === 'type' || selectedNode.kind === 'interface';

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
      {/* ── Entity Header ────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '14px 16px 12px 16px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          backgroundColor: '#fafafa',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: selectedNode.kind === 'interface' ? '#d97706' : selectedNode.kind === 'type' ? '#059669' : '#2563eb',
                backgroundColor: selectedNode.kind === 'interface' ? '#fffbeb' : selectedNode.kind === 'type' ? '#ecfdf5' : '#eff6ff',
                border: `1px solid ${selectedNode.kind === 'interface' ? '#fde68a' : selectedNode.kind === 'type' ? '#a7f3d0' : '#bfdbfe'}`,
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {currentExplanation && (
              <button
                onClick={() => fetchExplanation(selectedNode.id, true)}
                title="Regenerate AI explanation"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '3px 6px',
                }}
              >
                <RefreshCw size={12} />
              </button>
            )}
            <button
              onClick={handleCopyExplanation}
              title="Copy summary"
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
            >
              {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
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
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <FileCode2 size={12} color="#94a3b8" />
          <span>{selectedNode.path}</span>
        </div>
      </div>

      {/* ── Scrollable Body ─────────────────────────────────────────────────── */}
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
        {/* 1. What It Does (Plain English) */}
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
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#0f172a',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Lightbulb size={13} color="#2563eb" />
            <span>What it does</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>
            {plainSpec.whatItDoes}
          </p>
        </div>

        {/* 2. Why It Exists */}
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
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#0f172a',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <HelpCircle size={13} color="#10b981" />
            <span>Why it exists</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>
            {plainSpec.whyItExists}
          </p>
        </div>

        {/* 3. Simple Input / Output Breakdown (for functions/methods) */}
        {(plainSpec.inputs.length > 0 || plainSpec.outputs.length > 0) && (
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
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#0f172a',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Boxes size={13} color="#6366f1" />
              <span>Inputs & Outputs</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {plainSpec.inputs.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#2563eb', fontWeight: 600, width: 60, flexShrink: 0 }}>
                    <LogIn size={12} />
                    <span>Inputs:</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {plainSpec.inputs.map((inp, idx) => (
                      <span
                        key={idx}
                        style={{
                          backgroundColor: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          borderRadius: '4px',
                          padding: '1px 6px',
                          fontFamily: 'var(--font-mono), monospace',
                          fontSize: '0.7rem',
                          color: '#334155',
                        }}
                      >
                        <strong>{inp.name}</strong> <span style={{ color: '#64748b' }}>({inp.type})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {plainSpec.outputs.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#059669', fontWeight: 600, width: 60, flexShrink: 0 }}>
                    <LogOut size={12} />
                    <span>Returns:</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {plainSpec.outputs.map((out, idx) => (
                      <span
                        key={idx}
                        style={{
                          backgroundColor: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          borderRadius: '4px',
                          padding: '1px 6px',
                          fontFamily: 'var(--font-mono), monospace',
                          fontSize: '0.7rem',
                          color: '#065f46',
                        }}
                      >
                        {out}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. What It Connects To */}
        {(neighbors.callers.length > 0 || neighbors.callees.length > 0 || neighbors.types.length > 0) && (
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
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#0f172a',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Layers size={13} color="#8b5cf6" />
              <span>What it connects to</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.75rem' }}>
              {neighbors.callers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArrowLeft size={12} color="#2563eb" style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: '#2563eb', width: 70, flexShrink: 0 }}>Called by:</span>
                  <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {neighbors.callers.join(', ')}
                  </span>
                </div>
              )}

              {neighbors.callees.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArrowRight size={12} color="#059669" style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: '#059669', width: 70, flexShrink: 0 }}>Calls:</span>
                  <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {neighbors.callees.join(', ')}
                  </span>
                </div>
              )}

              {neighbors.types.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Boxes size={12} color="#7c3aed" style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: '#7c3aed', width: 70, flexShrink: 0 }}>Uses Type:</span>
                  <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {neighbors.types.join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AI Deep Dive Section ("Teach Me") ────────────────────────────── */}
        {!currentExplanation && !loading && !error && (
          <div
            style={{
              padding: '16px 14px',
              backgroundColor: isHighLevel ? '#f0fdf4' : '#eff6ff',
              border: `1px dashed ${isHighLevel ? '#bbf7d0' : '#bfdbfe'}`,
              borderRadius: '8px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: isHighLevel ? '#15803d' : '#1d4ed8', fontWeight: 600, fontSize: '0.82rem' }}>
              <GraduationCap size={16} />
              <span>{isHighLevel ? 'High-Level Architectural Synthesis' : 'Teach Me (Deep Dive)'}</span>
            </div>
            <p style={{ fontSize: '0.74rem', color: isHighLevel ? '#166534' : '#3b82f6', margin: 0, lineHeight: 1.45, maxWidth: 260 }}>
              {isHighLevel
                ? 'Synthesize the architectural role, mental model, and subsystem interactions with Nemotron 120B.'
                : 'Explain intuition → core concepts → implementation flow → technical invariants.'}
            </p>
            <button
              onClick={() => fetchExplanation(selectedNode.id)}
              style={{
                marginTop: 4,
                backgroundColor: isHighLevel ? '#16a34a' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 16px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'transform 0.1s ease',
              }}
            >
              <Sparkles size={13} />
              <span>{isHighLevel ? 'Synthesize Architecture with AI' : 'Teach Me with AI'}</span>
            </button>
          </div>
        )}

        {loading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '2rem 0',
              color: '#64748b',
            }}
          >
            <Loader2 size={22} className="animate-spin" color="#2563eb" />
            <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Nemotron 120B is synthesizing plain-English breakdown…</span>
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#dc2626',
                marginBottom: 4,
              }}
            >
              <AlertCircle size={14} />
              Explanation failed
            </div>
            <p style={{ fontSize: '0.74rem', color: '#991b1b', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {error}
            </p>
            <button
              onClick={() => fetchExplanation(selectedNode.id, true)}
              style={{
                marginTop: 8,
                fontSize: '0.74rem',
                color: '#2563eb',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Retry explanation →
            </button>
          </div>
        )}

        {/* ── Rendered 4-part AI Progression ───────────────────────────────── */}
        {!loading && sections.length > 0 && sections.map((sec) => (
          <div
            key={sec.number}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '14px 16px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <div
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: '#0f172a',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                }}
              >
                {sec.number}
              </span>
              <span>{sec.title}</span>
            </div>
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sec.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {/* ── Follow-Up Sparkle Question Box ──────────────────────────────── */}
        {currentExplanation && !loading && (
          <div
            style={{
              marginTop: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Conversation Messages */}
            {currentChatMessages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentChatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      lineHeight: 1.5,
                      backgroundColor: msg.role === 'user' ? '#f1f5f9' : '#ffffff',
                      border: msg.role === 'user' ? '1px solid #e2e8f0' : '1px solid #bfdbfe',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontWeight: 700,
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        color: msg.role === 'user' ? '#475569' : '#2563eb',
                        marginBottom: 4,
                      }}
                    >
                      {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                      <span>{msg.role === 'user' ? 'You' : 'CodeLens AI'}</span>
                    </div>
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {chatLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  backgroundColor: '#eff6ff',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  color: '#2563eb',
                }}
              >
                <Loader2 size={14} className="animate-spin" />
                <span>Thinking about your question…</span>
              </div>
            )}

            {chatError && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  color: '#dc2626',
                }}
              >
                {chatError}
              </div>
            )}

            {/* Sparkle Action Button or Thin Textbox */}
            {!showChatInput && currentChatMessages.length === 0 ? (
              <button
                onClick={() => setShowChatInput(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  backgroundColor: '#fafafa',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '6px',
                  color: '#475569',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                className="hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50"
              >
                <Sparkles size={13} color="#2563eb" />
                <span>Ask a follow-up question about {selectedNode.name}…</span>
              </button>
            ) : (
              <form
                onSubmit={handleSendChat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#ffffff',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  padding: '2px 4px 2px 8px',
                  boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.1)',
                  gap: 6,
                }}
              >
                <Sparkles size={13} color="#2563eb" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder={`Ask anything about ${selectedNode.name}…`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={chatLoading}
                  autoFocus
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    fontSize: '0.76rem',
                    color: '#0f172a',
                    padding: '6px 2px',
                    fontFamily: 'var(--font-sans)',
                  }}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    backgroundColor: chatInput.trim() ? '#2563eb' : '#f1f5f9',
                    color: chatInput.trim() ? '#ffffff' : '#94a3b8',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    cursor: chatInput.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Send size={12} />
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Collapsible Technical Spec & Source Code ─────────────────────── */}
        <div
          style={{
            marginTop: 4,
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: '#ffffff',
          }}
        >
          <button
            onClick={() => setShowTechnicalSpec((prev) => !prev)}
            style={{
              width: '100%',
              padding: '10px 14px',
              backgroundColor: '#f8fafc',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.74rem',
              fontWeight: 600,
              color: '#475569',
            }}
          >
            <span>Technical Spec & Code</span>
            {showTechnicalSpec ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showTechnicalSpec && (
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #e2e8f0' }}>
              {selectedNode.metadata?.signature && (
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                    Type Signature
                  </div>
                  <code
                    style={{
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono), monospace',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '5px',
                      padding: '6px 10px',
                      display: 'block',
                      color: '#0f172a',
                      overflowX: 'auto',
                      whiteSpace: 'pre',
                    }}
                  >
                    {selectedNode.metadata.signature}
                  </code>
                </div>
              )}

              {selectedNode.metadata?.receiver && (
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  <strong>Receiver:</strong> <code>{selectedNode.metadata.receiver}</code>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
