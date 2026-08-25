import { create } from 'zustand';
import { Graph, NodeKind } from '../types/graph';
import { mockCodebaseGraph } from '../mockData';

interface VisualizerState {
  // Graph state
  graph: Graph;
  setGraph: (graph: Graph) => void;
  
  // Selection & Interactivity
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  selectNode: (id: string | null) => void;
  setHoveredNode: (id: string | null) => void;
  
  // Search & Filtering
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeKindFilters: Set<NodeKind>;
  toggleKindFilter: (kind: NodeKind) => void;

  // View & Layout options
  layoutDirection: 'LR' | 'TB';
  setLayoutDirection: (dir: 'LR' | 'TB') => void;
  showEdgeLabels: boolean;
  toggleEdgeLabels: () => void;
  showMiniMap: boolean;
  toggleMiniMap: () => void;
  layoutEpoch: number;
  triggerAutoLayout: () => void;

  // Drilldown / Breadcrumbs
  breadcrumbs: { id: string; name: string; kind: string }[];
  pushBreadcrumb: (crumb: { id: string; name: string; kind: string }) => void;
  popBreadcrumb: (index: number) => void;
  resetBreadcrumbs: () => void;

  // Sidebar controls
  isLeftPanelOpen: boolean;
  toggleLeftPanel: () => void;
  isRightPanelOpen: boolean;
  toggleRightPanel: () => void;
}

export const useStore = create<VisualizerState>((set, get) => ({
  graph: mockCodebaseGraph,
  setGraph: (graph) => set({ graph }),

  selectedNodeId: 'pkg:auth',
  hoveredNodeId: null,
  selectNode: (id) => {
    set({ selectedNodeId: id });
    if (id) {
      const node = get().graph.nodes.find((n) => n.id === id);
      if (node) {
        const currentCrumbs = get().breadcrumbs;
        const existsIndex = currentCrumbs.findIndex((c) => c.id === id);
        if (existsIndex >= 0) {
          set({ breadcrumbs: currentCrumbs.slice(0, existsIndex + 1) });
        } else {
          set({
            breadcrumbs: [...currentCrumbs, { id: node.id, name: node.name, kind: node.kind }],
          });
        }
      }
    }
  },
  setHoveredNode: (id) => set({ hoveredNodeId: id }),

  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  activeKindFilters: new Set<NodeKind>(['type', 'interface', 'package', 'file', 'function', 'table']),
  toggleKindFilter: (kind) =>
    set((state) => {
      const next = new Set(state.activeKindFilters);
      if (next.has(kind)) {
        if (next.size > 1) next.delete(kind);
      } else {
        next.add(kind);
      }
      return { activeKindFilters: next };
    }),

  layoutDirection: 'LR',
  setLayoutDirection: (layoutDirection) => set({ layoutDirection }),
  showEdgeLabels: true,
  toggleEdgeLabels: () => set((state) => ({ showEdgeLabels: !state.showEdgeLabels })),
  showMiniMap: true,
  toggleMiniMap: () => set((state) => ({ showMiniMap: !state.showMiniMap })),
  layoutEpoch: 0,
  triggerAutoLayout: () => set((state) => ({ layoutEpoch: state.layoutEpoch + 1 })),

  breadcrumbs: [{ id: 'root', name: 'Codebase Schema', kind: 'root' }, { id: 'pkg:auth', name: 'AuthService', kind: 'type' }],
  pushBreadcrumb: (crumb) =>
    set((state) => ({ breadcrumbs: [...state.breadcrumbs, crumb] })),
  popBreadcrumb: (index) =>
    set((state) => {
      const newCrumbs = state.breadcrumbs.slice(0, index + 1);
      const targetId = newCrumbs[newCrumbs.length - 1]?.id;
      return {
        breadcrumbs: newCrumbs,
        selectedNodeId: targetId === 'root' ? null : targetId,
      };
    }),
  resetBreadcrumbs: () =>
    set({
      breadcrumbs: [{ id: 'root', name: 'Codebase Schema', kind: 'root' }],
      selectedNodeId: null,
    }),

  isLeftPanelOpen: true,
  toggleLeftPanel: () => set((state) => ({ isLeftPanelOpen: !state.isLeftPanelOpen })),
  isRightPanelOpen: true,
  toggleRightPanel: () => set((state) => ({ isRightPanelOpen: !state.isRightPanelOpen })),
}));
