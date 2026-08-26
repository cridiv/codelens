export type NodeKind = 'package' | 'file' | 'type' | 'function' | 'interface' | 'table' | 'packageCluster';

export interface SchemaMember {
  name: string;
  type: string;
  kind?: 'field' | 'method' | 'function' | 'parameter';
  isExported?: boolean;
  description?: string;
}

export interface Node {
  id: string;
  kind: NodeKind;
  name: string;
  path: string;
  metadata?: {
    signature?: string;
    receiver?: string;
    package?: string;
    file?: string;
    doc?: string;
    members?: string;
    loc?: string;
    importsCount?: string;
    callsCount?: string;
    [key: string]: any;
  };
  // Parsed members for schema rendering
  members?: SchemaMember[];
}

export type EdgeKind = 'calls' | 'imports' | 'implements' | 'depends_on' | 'contains' | 'references' | 'foreign_key';

export interface Edge {
  id?: string;
  from: string;
  to: string;
  kind: EdgeKind;
  metadata?: Record<string, string>;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export interface NodeExplanation {
  intuition: string;
  purpose: string;
  howItWorks: string[];
  dependencies: {
    callers: string[];
    callees: string[];
    types: string[];
  };
  codeBreakdown: string;
  rawText?: string;
}
