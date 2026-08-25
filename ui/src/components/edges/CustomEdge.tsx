import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from 'reactflow';
import { useStore } from '../../store/useStore';

export const CustomEdge: React.FC<EdgeProps> = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) => {
  const { selectedNodeId, hoveredNodeId, showEdgeLabels } = useStore();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const focusId = hoveredNodeId || selectedNodeId;
  const isDirectlyConnected = focusId ? source === focusId || target === focusId : false;
  const isSource = focusId ? source === focusId : false;

  const kind = data?.kind || 'references';
  const label = data?.label || kind;

  const getEdgeStyle = () => {
    if (isDirectlyConnected) {
      return {
        stroke: isSource ? '#3b82f6' : '#10b981',
        strokeWidth: 2.5,
        opacity: 1,
      };
    }
    if (focusId && !isDirectlyConnected) {
      return {
        stroke: '#cbd5e1',
        strokeWidth: 1.2,
        opacity: 0.35,
      };
    }
    return {
      stroke: '#94a3b8',
      strokeWidth: 1.5,
      opacity: 0.85,
    };
  };

  const getLabelColor = () => {
    switch (kind) {
      case 'calls':
        return { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' };
      case 'implements':
        return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' };
      case 'foreign_key':
        return { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' };
      case 'imports':
        return { bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' };
      default:
        return { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };
    }
  };

  const labelColors = getLabelColor();

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...getEdgeStyle(),
          transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s',
        }}
      />
      {showEdgeLabels && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              zIndex: isDirectlyConnected ? 100 : 1,
            }}
            className="nodrag nopan"
          >
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                fontFamily: 'var(--font-mono), monospace',
                backgroundColor: isDirectlyConnected ? labelColors.bg : '#ffffff',
                color: isDirectlyConnected ? labelColors.text : '#64748b',
                border: `1px solid ${isDirectlyConnected ? labelColors.border : '#e2e8f0'}`,
                padding: '2px 7px',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
