import { create } from 'zustand';
import { Graph, NodeKind } from '../types/graph';
import { mockCodebaseGraph } from '../mockData';

export type ScopeMode = 'file' | 'package' | 'all';

export interface BreadcrumbItem {
  id: string;
  name: string;
  kind: 'root' | 'package' | 'file' | 'type' | 'interface' | 'function' | 'table';
  targetPath?: string;
  targetPackage?: string;
}

interface VisualizerState {
  // Graph state
  graph: Graph;
  setGraph: (graph: Graph) => void;

  // Scope & Hierarchy state
  scopeMode: ScopeMode;
  activeFilePath: string | null;
  activePackage: string | null;
  setActiveFile: (filePath: string | null) => void;
  setActivePackage: (pkg: string | null) => void;
  setScopeMode: (mode: ScopeMode) => void;

  // Selection & Interactivity
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  selectNode: (id: string | null, shouldNavigateFile?: boolean) => void;
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
  breadcrumbs: BreadcrumbItem[];
  popBreadcrumb: (index: number) => void;
  resetBreadcrumbs: () => void;

  // Sidebar controls
  isLeftPanelOpen: boolean;
  toggleLeftPanel: () => void;
  isRightPanelOpen: boolean;
  toggleRightPanel: () => void;
}

const buildBreadcrumbs = (
  scopeMode: ScopeMode,
  activePackage: string | null,
  activeFilePath: string | null,
  selectedNodeName?: string,
  selectedNodeKind?: string,
  selectedNodeId?: string | null
): BreadcrumbItem[] => {
  const crumbs: BreadcrumbItem[] = [
    { id: 'scope:root', name: 'Codebase Overview', kind: 'root' },
  ];

  if (activePackage && (scopeMode === 'package' || scopeMode === 'file')) {
    crumbs.push({
      id: `pkg:${activePackage}`,
      name: `pkg/${activePackage}`,
      kind: 'package',
      targetPackage: activePackage,
    });
  }

  if (activeFilePath && scopeMode === 'file') {
    const fileName = activeFilePath.split('/').pop() || activeFilePath;
    crumbs.push({
      id: `file:${activeFilePath}`,
      name: fileName,
      kind: 'file',
      targetPath: activeFilePath,
      targetPackage: activePackage || undefined,
    });
  }

  if (selectedNodeId && selectedNodeName) {
    crumbs.push({
      id: selectedNodeId,
      name: selectedNodeName,
      kind: (selectedNodeKind || 'type') as BreadcrumbItem['kind'],
    });
  }

  return crumbs;
};

export const useStore = create<VisualizerState>((set, get) => ({
  graph: mockCodebaseGraph,
  setGraph: (graph) => set({ graph }),

  // Default to the primary service file schema
  scopeMode: 'file',
  activeFilePath: 'internal/auth/service.go',
  activePackage: 'auth',

  setActiveFile: (filePath) => {
    if (!filePath) {
      set({
        scopeMode: 'all',
        activeFilePath: null,
        activePackage: null,
        selectedNodeId: null,
        breadcrumbs: buildBreadcrumbs('all', null, null),
      });
      return;
    }

    // Find package corresponding to this file
    const nodeInFile = get().graph.nodes.find((n) => n.path === filePath);
    const pkg = nodeInFile?.metadata?.package || null;

    // Default select first node in file if any
    const firstNode = nodeInFile ? nodeInFile.id : null;

    set({
      scopeMode: 'file',
      activeFilePath: filePath,
      activePackage: pkg,
      selectedNodeId: firstNode,
      breadcrumbs: buildBreadcrumbs(
        'file',
        pkg,
        filePath,
        nodeInFile?.name,
        nodeInFile?.kind,
        firstNode
      ),
    });
  },

  setActivePackage: (pkg) => {
    if (!pkg) {
      set({
        scopeMode: 'all',
        activeFilePath: null,
        activePackage: null,
        selectedNodeId: null,
        breadcrumbs: buildBreadcrumbs('all', null, null),
      });
      return;
    }

    set({
      scopeMode: 'package',
      activePackage: pkg,
      activeFilePath: null,
      selectedNodeId: null,
      breadcrumbs: buildBreadcrumbs('package', pkg, null),
    });
  },

  setScopeMode: (mode) => {
    const { activePackage, activeFilePath, selectedNodeId, graph } = get();
    const selNode = selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) : undefined;
    set({
      scopeMode: mode,
      breadcrumbs: buildBreadcrumbs(
        mode,
        activePackage,
        activeFilePath,
        selNode?.name,
        selNode?.kind,
        selectedNodeId
      ),
    });
  },

  selectedNodeId: 'pkg:auth',
  hoveredNodeId: null,

  selectNode: (id, shouldNavigateFile = false) => {
    set({ selectedNodeId: id });
    if (!id) {
      const { scopeMode, activePackage, activeFilePath } = get();
      set({ breadcrumbs: buildBreadcrumbs(scopeMode, activePackage, activeFilePath) });
      return;
    }

    const node = get().graph.nodes.find((n) => n.id === id);
    if (node) {
      const nodePkg = node.metadata?.package || null;
      const nodePath = node.path || null;

      if (shouldNavigateFile && nodePath) {
        set({
          scopeMode: 'file',
          activeFilePath: nodePath,
          activePackage: nodePkg,
          breadcrumbs: buildBreadcrumbs('file', nodePkg, nodePath, node.name, node.kind, node.id),
        });
      } else {
        const { scopeMode, activePackage, activeFilePath } = get();
        set({
          breadcrumbs: buildBreadcrumbs(
            scopeMode,
            activePackage || nodePkg,
            activeFilePath || nodePath,
            node.name,
            node.kind,
            node.id
          ),
        });
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

  breadcrumbs: [
    { id: 'scope:root', name: 'Codebase Overview', kind: 'root' },
    { id: 'pkg:auth', name: 'pkg/auth', kind: 'package', targetPackage: 'auth' },
    { id: 'file:internal/auth/service.go', name: 'service.go', kind: 'file', targetPath: 'internal/auth/service.go', targetPackage: 'auth' },
    { id: 'pkg:auth', name: 'AuthService', kind: 'type' },
  ],

  popBreadcrumb: (index) => {
    const crumbs = get().breadcrumbs;
    const item = crumbs[index];
    if (!item) return;

    if (item.kind === 'root') {
      get().setScopeMode('all');
      set({ selectedNodeId: null });
    } else if (item.kind === 'package' && item.targetPackage) {
      get().setActivePackage(item.targetPackage);
    } else if (item.kind === 'file' && item.targetPath) {
      get().setActiveFile(item.targetPath);
    } else {
      get().selectNode(item.id);
    }
  },

  resetBreadcrumbs: () => {
    get().setScopeMode('all');
    set({
      selectedNodeId: null,
      breadcrumbs: [{ id: 'scope:root', name: 'Codebase Overview', kind: 'root' }],
    });
  },

  isLeftPanelOpen: true,
  toggleLeftPanel: () => set((state) => ({ isLeftPanelOpen: !state.isLeftPanelOpen })),
  isRightPanelOpen: true,
  toggleRightPanel: () => set((state) => ({ isRightPanelOpen: !state.isRightPanelOpen })),
}));
