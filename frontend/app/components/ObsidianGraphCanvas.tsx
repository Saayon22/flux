"use client";

/**
 * Obsidian-Style Force-Directed Dependency Graph Canvas.
 * Renders an interactive 2D physics graph displaying source code files (nodes)
 * and import dependencies (edges) with smooth pan, zoom, dragging, and hover effects.
 */

import React, { useEffect, useRef, useState, useMemo } from "react";
import { GraphResponse, GraphNode, GraphEdge } from "../lib/api";

interface ObsidianGraphCanvasProps {
  graph: GraphResponse;
}

interface SimNode {
  id: string;
  label: string;
  language: string;
  line_count: number;
  in_degree: number;
  out_degree: number;
  centrality: number;
  cluster: number;
  symbolsCount: number;
  rawNode: GraphNode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isDragging?: boolean;
}

interface SimEdge {
  source: string;
  target: string;
}

export default function ObsidianGraphCanvas({ graph }: ObsidianGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport transforms: pan and zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);

  // Interaction tracking refs
  const isPanningRef = useRef(false);
  const startPanRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<SimNode | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const animFrameIdRef = useRef<number | null>(null);

  // Color mapping based on language / cluster
  const getNodeColor = (lang: string): string => {
    switch (lang.toLowerCase()) {
      case "python":
        return "#10b981"; // Emerald green
      case "javascript":
      case "typescript":
        return "#38bdf8"; // Sky blue
      default:
        return "#a855f7"; // Purple
    }
  };

  // Initialize simulation data whenever graph prop changes
  useEffect(() => {
    const width = 800;
    const height = 500;

    // Build SimNodes with initial randomized positions clustered around center
    const simNodes: SimNode[] = graph.nodes.map((n, idx) => {
      const angle = (idx / Math.max(graph.nodes.length, 1)) * 2 * Math.PI;
      const radiusDist = 120 + Math.random() * 80;
      // Node radius proportional to in-degree and centrality
      const baseRadius = 6;
      const bonus = Math.min(n.in_degree * 2.5 + n.centrality * 12, 16);

      return {
        id: n.id,
        label: n.label,
        language: n.language,
        line_count: n.line_count,
        in_degree: n.in_degree,
        out_degree: n.out_degree,
        centrality: n.centrality,
        cluster: n.cluster,
        symbolsCount: n.symbols ? n.symbols.length : 0,
        rawNode: n,
        x: width / 2 + Math.cos(angle) * radiusDist + (Math.random() - 0.5) * 40,
        y: height / 2 + Math.sin(angle) * radiusDist + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius: baseRadius + bonus,
      };
    });

    const simEdges: SimEdge[] = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));

    nodesRef.current = simNodes;
    edgesRef.current = simEdges;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
    setHoveredNode(null);
  }, [graph]);

  // Set of node IDs directly connected to hovered node (for 1-hop highlighting)
  const connectedIds = useMemo(() => {
    const target = hoveredNode || selectedNode;
    if (!target) return new Set<string>();
    const set = new Set<string>();
    set.add(target.id);
    edgesRef.current.forEach((e) => {
      if (e.source === target.id) set.add(e.target);
      if (e.target === target.id) set.add(e.source);
    });
    return set;
  }, [hoveredNode, selectedNode]);

  // Main physics simulation and rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    const tickPhysics = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const centerX = width / 2;
      const centerY = height / 2;

      // 1. Coulomb Repulsion between node pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          if (dist < 350) {
            const force = 1800 / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (!a.isDragging) {
              a.vx -= fx;
              a.vy -= fy;
            }
            if (!b.isDragging) {
              b.vx += fx;
              b.vy += fy;
            }
          }
        }
      }

      // Map node IDs to nodes for fast edge traversal
      const nodeMap = new Map<string, SimNode>();
      nodes.forEach((n) => nodeMap.set(n.id, n));

      // 2. Hooke's Spring Attraction along edges
      const springLength = 85;
      const springK = 0.04;
      for (const edge of edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const displacement = dist - springLength;
        const force = displacement * springK;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!source.isDragging) {
          source.vx += fx;
          source.vy += fy;
        }
        if (!target.isDragging) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      // 3. Centering force & velocity damping
      const damping = 0.82;
      const centerForce = 0.003;
      for (const node of nodes) {
        if (node.isDragging) continue;

        node.vx += (centerX - node.x) * centerForce;
        node.vy += (centerY - node.y) * centerForce;

        node.vx *= damping;
        node.vy *= damping;

        node.x += node.vx;
        node.y += node.vy;
      }
    };

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply viewport transformation (Pan + Zoom from center)
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeMap = new Map<string, SimNode>();
      nodes.forEach((n) => nodeMap.set(n.id, n));

      const activeTarget = hoveredNode || selectedNode;

      // Draw Edges
      for (const edge of edges) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;

        const isHighlighted =
          activeTarget &&
          (src.id === activeTarget.id || tgt.id === activeTarget.id);

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);

        if (isHighlighted) {
          ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
          ctx.lineWidth = 1.8 / zoom;
        } else if (activeTarget) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
          ctx.lineWidth = 0.8 / zoom;
        } else {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
          ctx.lineWidth = 1 / zoom;
        }
        ctx.stroke();
      }

      // Draw Nodes
      for (const node of nodes) {
        const isConnected = !activeTarget || connectedIds.has(node.id);
        const isFocused = activeTarget && activeTarget.id === node.id;
        const color = getNodeColor(node.language);

        ctx.save();

        // Glowing outer aura for focused / central nodes
        if (isFocused || node.in_degree > 2) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + (isFocused ? 6 : 3), 0, 2 * Math.PI);
          ctx.fillStyle = isFocused ? "rgba(56, 189, 248, 0.35)" : "rgba(16, 185, 129, 0.15)";
          ctx.fill();
        }

        // Inner Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = isConnected ? color : "rgba(75, 85, 99, 0.3)";
        ctx.fill();

        // Border ring
        ctx.strokeStyle = isFocused ? "#ffffff" : isConnected ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = (isFocused ? 2 : 1) / zoom;
        ctx.stroke();

        // Node Label
        const showLabel = isFocused || isConnected || zoom >= 0.95 || node.in_degree > 1;
        if (showLabel) {
          ctx.font = `${Math.max(10 / zoom, 9)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = isFocused ? "#ffffff" : isConnected ? "rgba(229, 231, 235, 0.85)" : "rgba(107, 114, 128, 0.4)";
          ctx.fillText(node.label, node.x, node.y + node.radius + 12 / zoom);
        }

        ctx.restore();
      }

      ctx.restore();

      if (isRunning) {
        tickPhysics();
        animFrameIdRef.current = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [pan, zoom, hoveredNode, selectedNode, connectedIds]);

  // Adjust canvas size to parent container with DPR scaling
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = 520 * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `520px`;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Transform screen coordinate to canvas coordinate
  const screenToCanvas = (screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (screenX - rect.left - pan.x) / zoom;
    const y = (screenY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  // Find node under coordinate
  const findNodeAt = (canvasX: number, canvasY: number): SimNode | null => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - canvasX;
      const dy = n.y - canvasY;
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) {
        return n;
      }
    }
    return null;
  };

  // Mouse Handlers for Pan, Drag, Hover, Click
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const clickedNode = findNodeAt(x, y);

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      clickedNode.isDragging = true;
      setSelectedNode(clickedNode);
    } else {
      isPanningRef.current = true;
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = x;
      draggedNodeRef.current.y = y;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
    } else if (isPanningRef.current) {
      setPan({
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y,
      });
    } else {
      const node = findNodeAt(x, y);
      setHoveredNode(node);
    }
  };

  const handleMouseUp = () => {
    if (draggedNodeRef.current) {
      draggedNodeRef.current.isDragging = false;
      draggedNodeRef.current = null;
    }
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setZoom((prev) => Math.min(Math.max(prev * factor, 0.3), 3.5));
  };

  return (
    <div className="border border-neutral-800 bg-neutral-950 rounded-xl overflow-hidden shadow-2xl space-y-0">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-neutral-800/80 bg-neutral-900/40 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold text-neutral-200 uppercase tracking-wider text-[11px]">
            Obsidian Graph Canvas
          </span>
          <span className="text-neutral-500">|</span>
          <span className="text-neutral-400">{graph.metrics.total_nodes} files</span>
          <span className="text-neutral-600">&bull;</span>
          <span className="text-neutral-400">{graph.metrics.total_edges} dependencies</span>
          <span className="text-neutral-600">&bull;</span>
          <span className="text-neutral-400">Density {graph.metrics.density}</span>
        </div>

        {/* Viewport Control Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z * 1.2, 3.5))}
            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors cursor-pointer"
            title="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z * 0.8, 0.3))}
            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors cursor-pointer"
            title="Zoom Out"
          >
            &minus;
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors cursor-pointer"
            title="Reset View"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="relative w-full h-[520px] bg-[#0b0d10] cursor-grab active:cursor-grabbing select-none overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full block"
        />

        {/* Canvas Instructions Overlay */}
        <div className="absolute bottom-3 left-3 text-[11px] text-neutral-500 bg-neutral-900/80 backdrop-blur px-2.5 py-1 rounded border border-neutral-800 pointer-events-none">
          Drag background to pan &bull; Scroll to zoom &bull; Drag nodes &bull; Hover to highlight
        </div>

        {/* Language Legend */}
        <div className="absolute top-3 right-3 flex items-center gap-3 text-[11px] bg-neutral-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-300 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Python</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
            <span>JS / TS</span>
          </div>
        </div>

        {/* Inspector Tooltip / Card for Selected Node */}
        {selectedNode && (
          <div className="absolute top-3 left-3 max-w-sm w-80 bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-xl p-4 shadow-2xl text-xs space-y-2.5">
            <div className="flex items-start justify-between gap-2 border-b border-neutral-800 pb-2">
              <div className="font-mono text-neutral-200 font-semibold truncate" title={selectedNode.id}>
                {selectedNode.id}
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="text-neutral-400 hover:text-white cursor-pointer text-xs"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className="bg-neutral-950 p-1.5 rounded border border-neutral-800">
                <div className="text-neutral-500">In-degree</div>
                <div className="font-semibold text-emerald-400">{selectedNode.in_degree}</div>
              </div>
              <div className="bg-neutral-950 p-1.5 rounded border border-neutral-800">
                <div className="text-neutral-500">Out-degree</div>
                <div className="font-semibold text-sky-400">{selectedNode.out_degree}</div>
              </div>
              <div className="bg-neutral-950 p-1.5 rounded border border-neutral-800">
                <div className="text-neutral-500">Lines</div>
                <div className="font-semibold text-neutral-300">{selectedNode.line_count}</div>
              </div>
            </div>

            {/* Extracted symbols */}
            {selectedNode.rawNode.symbols && selectedNode.rawNode.symbols.length > 0 ? (
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Defined Symbols ({selectedNode.rawNode.symbols.length}):
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[11px] pr-1">
                  {selectedNode.rawNode.symbols.map((sym, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-2 py-1 bg-neutral-950/80 rounded border border-neutral-800/80 text-neutral-300"
                    >
                      <span className="truncate">{sym.name}</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.2 bg-neutral-800 text-neutral-400 rounded">
                        {sym.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-neutral-500 text-[11px] italic">
                No functions or classes defined.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
