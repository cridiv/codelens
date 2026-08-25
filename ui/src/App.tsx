import { useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useStore } from './store/useStore';
import { Navbar } from './components/Navbar';
import { Canvas } from './components/Canvas';
import { HierarchyPanel } from './components/HierarchyPanel';
import { ExplanationPanel } from './components/ExplanationPanel';
import { Graph } from './types/graph';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function VisualizerApp() {
  const { setGraph, isLeftPanelOpen, isRightPanelOpen } = useStore();

  // Try to fetch live graph from Go backend if available
  const { data: serverGraph } = useQuery<Graph>({
    queryKey: ['codebase-graph'],
    queryFn: async () => {
      const res = await fetch('/api/graph');
      if (!res.ok) throw new Error('API not reachable');
      return res.json();
    },
    enabled: true,
    retry: false,
  });

  useEffect(() => {
    if (serverGraph && serverGraph.nodes?.length > 0) {
      setGraph(serverGraph);
    }
  }, [serverGraph, setGraph]);

  return (
    <div className="app-container">
      <Navbar />

      <main
        className="main-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: `${isLeftPanelOpen ? '300px' : '0px'} 1fr ${isRightPanelOpen ? '360px' : '0px'}`,
          transition: 'grid-template-columns 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Left: Codebase / Schema Hierarchy Panel */}
        <div style={{ overflow: 'hidden', height: '100%' }}>
          {isLeftPanelOpen && <HierarchyPanel />}
        </div>

        {/* Center: Interactive React Flow Schema Canvas */}
        <section className="canvas-area">
          <Canvas />
        </section>

        {/* Right: AI & Schema Inspector Sidebar */}
        <div style={{ overflow: 'hidden', height: '100%' }}>
          {isRightPanelOpen && <ExplanationPanel />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <VisualizerApp />
    </QueryClientProvider>
  );
}
