import { useState } from 'react'

export default function App() {
  const [nodeCount] = useState<number>(0)

  return (
    <div className="app-container">
      <header className="topbar">
        <div className="brand">
          <span>CodeLens</span>
          <span className="brand-badge">v0.1.0</span>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {nodeCount > 0 ? `${nodeCount} nodes loaded` : 'Ready to explore'}
        </div>
      </header>

      <main className="main-layout">
        {/* Left: Hierarchy Tree */}
        <aside className="panel left-panel">
          <div className="panel-header">Codebase Hierarchy</div>
          <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Hierarchy tree will display packages, files, and functions.
          </div>
        </aside>

        {/* Center: Graph Canvas */}
        <section className="canvas-area">
          <div className="placeholder-card">
            <h2>Interactive Codebase Map</h2>
            <p>
              Run CodeLens on a repository to visualize dependencies, call graphs, and architecture.
            </p>
          </div>
        </section>

        {/* Right: AI Explanation Sidebar */}
        <aside className="panel right-panel">
          <div className="panel-header">AI Architecture Insights</div>
          <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Select any node in the graph to get an architectural breakdown.
          </div>
        </aside>
      </main>
    </div>
  )
}
