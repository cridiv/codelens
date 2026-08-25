import dagre from 'dagre';
import { Node as RFNode, Edge as RFEdge } from 'reactflow';
import { Node, Edge } from '../types/graph';

export interface LayoutNode extends Node {
  isExternal?: boolean;
}

export interface LayoutGraph {
  nodes: LayoutNode[];
  edges: Edge[];
}

export interface LayoutOptions {
  direction?: 'LR' | 'TB' | 'RL' | 'BT';
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
}

export function computeGraphLayout(
  graph: LayoutGraph,
  options: LayoutOptions = {}
): { nodes: RFNode[]; edges: RFEdge[] } {
  const {
    direction = 'LR',
    nodeWidth = 320,
    rankSep = 80,
    nodeSep = 50,
  } = options;

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: rankSep,
    nodesep: nodeSep,
    marginx: 40,
    marginy: 40,
  });

  // Calculate approximate height based on member count
  const rfNodes: RFNode[] = graph.nodes.map((node) => {
    const memberCount = node.members?.length || 0;
    const computedHeight = Math.max(140, 80 + memberCount * 28 + (node.isExternal ? 30 : 0));

    dagreGraph.setNode(node.id, {
      width: nodeWidth,
      height: computedHeight,
    });

    return {
      id: node.id,
      type: 'schemaNode',
      data: {
        node,
        raw: node,
        isExternal: Boolean(node.isExternal),
      },
      position: { x: 0, y: 0 },
    };
  });

  const rfEdges: RFEdge[] = graph.edges.map((edge, index) => {
    const edgeId = edge.id || `e-${edge.from}-${edge.to}-${index}`;
    dagreGraph.setEdge(edge.from, edge.to);

    return {
      id: edgeId,
      source: edge.from,
      target: edge.to,
      type: 'customEdge',
      data: {
        kind: edge.kind,
        label: edge.metadata?.label || edge.kind,
      },
      animated: edge.kind === 'calls' || edge.kind === 'references',
    };
  });

  dagre.layout(dagreGraph);

  // Apply computed positions from Dagre
  const layoutedNodes = rfNodes.map((node) => {
    const nodeWithPos = dagreGraph.node(node.id);
    const memberCount = (node.data.node.members?.length || 0);
    const computedHeight = Math.max(140, 80 + memberCount * 28 + (node.data.isExternal ? 30 : 0));

    return {
      ...node,
      draggable: false,
      position: {
        // Dagre centers nodes, React Flow coordinates are top-left
        x: nodeWithPos ? nodeWithPos.x - nodeWidth / 2 : 0,
        y: nodeWithPos ? nodeWithPos.y - computedHeight / 2 : 0,
      },
    };
  });

  return { nodes: layoutedNodes, edges: rfEdges };
}
