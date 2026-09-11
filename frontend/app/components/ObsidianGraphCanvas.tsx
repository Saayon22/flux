"use client";

/**
 * Obsidian-Style Force-Directed Dependency Graph Explorer Canvas.
 * Renders an interactive 2D physics graph displaying source code files (nodes)
 * and import dependencies (edges) with smooth pan, zoom, dragging, directional flow arrows,
 * clustering filters, search auto-centering, and deep node inspection.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { GraphResponse, GraphNode, GraphEdge } from "../lib/api";
import NodeInspectorDrawer from "./NodeInspectorDrawer";

interface ObsidianGraphCanvasProps {
  owner: string;
  repo: string;
  graph: GraphResponse;
  focusedNodeId?: string | null;
  onClearFocus?: () => void;
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

// Vibrant community cluster palette for visual grouping
const CLUSTER_COLORS = [
  "#10b981", // Emerald
  "#38bdf8", // Sky Blue
  "#a855f7", // Violet
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#84cc16", // Lime
  "#f97316", // Orange
];

export default function ObsidianGraphCanvas({
  owner,
  repo,
  graph,
  focusedNodeId,
  onClearFocus,
}: ObsidianGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport transforms: pan and zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);

  // Filtering & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedClusterFilter, setSelectedClusterFilter] = useState<number | "all">("all");
  const [minDegreeFilter, setMinDegreeFilter] = useState<number>(0);
  const [isPhysicsFrozen, setIsPhysicsFrozen] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });

  // Interaction tracking refs
  const isPanningRef = useRef(false);
  const startPanRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<SimNode | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const animFrameIdRef = useRef<number | null>(null);

  // Color mapping based on cluster or language
  const getNodeColor = useCallback((node: SimNode): string => {
    if (node.cluster !== undefined && node.cluster >= 0) {
      return CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length];
    }
    switch (node.language.toLowerCase()) {
      case "python":
        return "#10b981";
      case "javascript":
      case "typescript":
        return "#38bdf8";
      default:
        return "#a855f7";
    }
  }, []);

  // Initialize simulation data whenever graph prop changes
  useEffect(() => {
    const width = 800;
    const height = 500;

    const simNodes: SimNode[] = graph.nodes.map((n, idx) => {
      const angle = (idx / Math.max(graph.nodes.length, 1)) * 2 * Math.PI;
      const radiusDist = 140 + Math.random() * 80;
      const baseRadius = 6;
      const bonus = Math.min(n.in_degree * 2.5 + n.centrality * 14, 18);

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

  // Center on node helper
  const centerOnNode = useCallback((nodeId: string) => {
    const target = nodesRef.current.find((n) => n.id === nodeId);
    const canvas = canvasRef.current;
    if (!target || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const targetZoom = 1.35;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setZoom(targetZoom);
    setPan({
      x: centerX - target.x * targetZoom,
      y: centerY - target.y * targetZoom,
    });
    setSelectedNode(target);
  }, []);

  // Handle external focus triggers (e.g. from Understanding cards)
  useEffect(() => {

    if (focusedNodeId) {
      centerOnNode(focusedNodeId);
    }
  }, [focusedNodeId, centerOnNode]);

  // Set of unique clusters available in graph
  const availableClusters = useMemo(() => {
    const set = new Set<number>();
    graph.nodes.forEach((n) => {
      if (n.cluster !== undefined && n.cluster >= 0) set.add(n.cluster);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [graph.nodes]);

  // Set of node IDs directly connected to active (hovered or selected) node (for 1-hop neighborhood)
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

  // Search filtered results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return graph.nodes
      .filter((n) => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [graph.nodes, searchQuery]);

  // Auto-fit all nodes to screen
  const handleZoomToFit = () => {
    const nodes = nodesRef.current;
    const canvas = canvasRef.current;
    if (!nodes.length || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    nodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const padding = 60;
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;

    const scaleX = rect.width / graphWidth;
    const scaleY = rect.height / graphHeight;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 2.0);

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    setZoom(newZoom);
    setPan({
      x: rect.width / 2 - midX * newZoom,
      y: rect.height / 2 - midY * newZoom,
    });
  };

  // Main physics simulation and rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    const tickPhysics = () => {
      if (isPhysicsFrozen) return;

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const centerX = width / 2;
      const centerY = height / 2;

      // 1. Coulomb Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          if (dist < 380) {
            const force = 2200 / distSq;
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

      // 2. Hooke's Spring Attraction along edges
      const nodeMap = new Map<string, SimNode>();
      nodes.forEach((n) => nodeMap.set(n.id, n));

      const springLength = 90;
      const springK = 0.045;
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
      const centerForce = 0.0035;
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
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      // Viewport transform (in CSS pixels)
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeMap = new Map<string, SimNode>();
      nodes.forEach((n) => nodeMap.set(n.id, n));

      const activeTarget = hoveredNode || selectedNode;

      // Draw Edges with Directional Flow Arrows
      for (const edge of edges) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;

        // Check if filtered by cluster or degree
        const srcPass =
          (selectedClusterFilter === "all" || src.cluster === selectedClusterFilter) &&
          src.in_degree + src.out_degree >= minDegreeFilter;
        const tgtPass =
          (selectedClusterFilter === "all" || tgt.cluster === selectedClusterFilter) &&
          tgt.in_degree + tgt.out_degree >= minDegreeFilter;

        if (!srcPass && !tgtPass) continue;

        const isOutbound = activeTarget && src.id === activeTarget.id;
        const isInbound = activeTarget && tgt.id === activeTarget.id;
        const isHighlighted = isOutbound || isInbound;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);

        if (isOutbound) {
          // Outgoing dependency: cyan/sky
          ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
          ctx.lineWidth = 2.2 / zoom;
        } else if (isInbound) {
          // Incoming dependent: emerald
          ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
          ctx.lineWidth = 2.2 / zoom;
        } else if (activeTarget) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
          ctx.lineWidth = 0.8 / zoom;
        } else {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
          ctx.lineWidth = 1 / zoom;
        }
        ctx.stroke();

        // Draw directional arrowhead towards target
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > tgt.radius + 15) {
          // Place arrow just before hitting target node radius
          const offsetDist = dist - tgt.radius - 4;
          const arrowX = src.x + (dx / dist) * offsetDist;
          const arrowY = src.y + (dy / dist) * offsetDist;
          const angle = Math.atan2(dy, dx);
          const arrowLength = (isHighlighted ? 7 : 5) / zoom;

          ctx.save();
          ctx.translate(arrowX, arrowY);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-arrowLength, -arrowLength * 0.5);
          ctx.lineTo(-arrowLength, arrowLength * 0.5);
          ctx.closePath();
          ctx.fillStyle = isOutbound
            ? "rgba(56, 189, 248, 0.95)"
            : isInbound
            ? "rgba(16, 185, 129, 0.95)"
            : "rgba(255, 255, 255, 0.25)";
          ctx.fill();
          ctx.restore();
        }
      }

      // Draw Nodes
      for (const node of nodes) {
        // Filter evaluation
        const clusterMatch =
          selectedClusterFilter === "all" || node.cluster === selectedClusterFilter;
        const degreeMatch = node.in_degree + node.out_degree >= minDegreeFilter;
        const isFilterActive = selectedClusterFilter !== "all" || minDegreeFilter > 0;

        if (isFilterActive && (!clusterMatch || !degreeMatch)) {
          // Dim completely if filtered out
          continue;
        }

        const isConnected = !activeTarget || connectedIds.has(node.id);
        const isFocused = activeTarget && activeTarget.id === node.id;
        const color = getNodeColor(node);

        ctx.save();

        // Glowing outer aura for focused or high centrality nodes
        if (isFocused || node.in_degree > 2) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + (isFocused ? 7 : 3.5), 0, 2 * Math.PI);
          ctx.fillStyle = isFocused
            ? "rgba(56, 189, 248, 0.4)"
            : "rgba(16, 185, 129, 0.18)";
          ctx.fill();
        }

        // Inner Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = isConnected ? color : "rgba(75, 85, 99, 0.25)";
        ctx.fill();

        // Border ring
        ctx.strokeStyle = isFocused
          ? "#ffffff"
          : isConnected
          ? "rgba(255, 255, 255, 0.45)"
          : "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = (isFocused ? 2.5 : 1) / zoom;
        ctx.stroke();

        // Node Label
        const showLabel = isFocused || isConnected || zoom >= 0.95 || node.in_degree > 1;
        if (showLabel) {
          ctx.font = `${Math.max(10 / zoom, 9)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = isFocused
            ? "#ffffff"
            : isConnected
            ? "rgba(229, 231, 235, 0.9)"
            : "rgba(107, 114, 128, 0.35)";
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
  }, [
    pan,
    zoom,
    hoveredNode,
    selectedNode,
    connectedIds,
    selectedClusterFilter,
    minDegreeFilter,
    isPhysicsFrozen,
    getNodeColor,
  ]);

  // Adjust canvas size to parent container with DPR scaling
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = 540 * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `540px`;
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

  // Find node under coordinate with generous hit radius and filter awareness
  const findNodeAt = (canvasX: number, canvasY: number): SimNode | null => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      // Skip nodes hidden by active filters
      const clusterMatch =
        selectedClusterFilter === "all" || n.cluster === selectedClusterFilter;
      const degreeMatch = n.in_degree + n.out_degree >= minDegreeFilter;
      if (selectedClusterFilter !== "all" || minDegreeFilter > 0) {
        if (!clusterMatch || !degreeMatch) continue;
      }

      const dx = n.x - canvasX;
      const dy = n.y - canvasY;
      // Generous hit radius: node radius + 12, minimum 18px click target
      const hitRadius = Math.max(n.radius + 12, 18);
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return n;
      }
    }
    return null;
  };

  // Mouse Handlers for Pan, Drag, Hover, Click
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const clickedNode = findNodeAt(x, y);

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      clickedNode.isDragging = true;
      setSelectedNode(clickedNode);
      setIsInteracting(true);
    } else {
      isPanningRef.current = true;
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      setIsInteracting(true);
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

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const distMoved = Math.hypot(
      e.clientX - mouseDownPosRef.current.x,
      e.clientY - mouseDownPosRef.current.y
    );

    // If mouse barely moved (< 6px), register as explicit click
    if (distMoved < 6) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      const clicked = findNodeAt(x, y);
      if (clicked) {
        setSelectedNode(clicked);
      }
    }

    if (draggedNodeRef.current) {
      draggedNodeRef.current.isDragging = false;
      draggedNodeRef.current = null;
    }
    isPanningRef.current = false;
    setIsInteracting(false);
  };

  const getCanvasCursor = () => {
    if (isInteracting) return "cursor-grabbing";
    if (hoveredNode) return "cursor-pointer";
    return "cursor-grab";
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setZoom((prev) => Math.min(Math.max(prev * factor, 0.3), 3.5));
  };

  const handleCloseInspector = () => {
    setSelectedNode(null);
    if (onClearFocus) onClearFocus();
  };

  return (
    <div className="border border-neutral-800 bg-neutral-950 rounded-xl overflow-hidden shadow-2xl space-y-0 relative">
      {/* Top Toolbar: Metrics, Controls, Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-neutral-800/80 bg-neutral-900/50 text-xs">
        {/* Left: Summary Metrics & Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold text-neutral-200 uppercase tracking-wider text-[11px]">
            Graph Explorer
          </span>
          <span className="text-neutral-500">|</span>
          <span className="text-neutral-400">{graph.metrics.total_nodes} files</span>
          <span className="text-neutral-600">&bull;</span>
          <span className="text-neutral-400">{graph.metrics.total_edges} dependencies</span>

          {/* Quick Node Search */}
          <div className="relative ml-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Search file or symbol..."
              className="px-2.5 py-1 bg-neutral-950 border border-neutral-700/80 rounded text-neutral-200 placeholder-neutral-500 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 w-44 font-mono"
            />
            {isSearchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl z-30 py-1 max-h-48 overflow-y-auto">
                {searchResults.map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      centerOnNode(res.id);
                      setIsSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-xs font-mono text-neutral-300 hover:text-white flex items-center justify-between group cursor-pointer"
                  >
                    <span className="truncate">{res.id}</span>
                    <span className="text-[10px] text-neutral-500 group-hover:text-emerald-400">
                      deg:{res.in_degree + res.out_degree}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Readability Filters & Viewport Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Cluster Filter */}
          {availableClusters.length > 1 && (
            <select
              value={selectedClusterFilter}
              onChange={(e) =>
                setSelectedClusterFilter(
                  e.target.value === "all" ? "all" : parseInt(e.target.value, 10)
                )
              }
              className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-300 focus:outline-none cursor-pointer"
              title="Filter by Community Cluster"
            >
              <option value="all">All Clusters ({availableClusters.length})</option>
              {availableClusters.map((c) => (
                <option key={c} value={c}>
                  Cluster #{c}
                </option>
              ))}
            </select>
          )}

          {/* Min Degree Filter (Declutter large graphs) */}
          <button
            type="button"
            onClick={() => setMinDegreeFilter((prev) => (prev === 0 ? 1 : prev === 1 ? 2 : 0))}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border ${
              minDegreeFilter > 0
                ? "bg-emerald-950/80 border-emerald-700 text-emerald-300 font-medium"
                : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
            }`}
            title="Toggle degree threshold to hide isolated leaves"
          >
            {minDegreeFilter === 0
              ? "All Nodes"
              : minDegreeFilter === 1
              ? "Connected (≥1)"
              : "Hubs Only (≥2)"}
          </button>

          {/* Freeze Physics Toggle */}
          <button
            type="button"
            onClick={() => setIsPhysicsFrozen((f) => !f)}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border ${
              isPhysicsFrozen
                ? "bg-amber-950/80 border-amber-700 text-amber-300 font-medium"
                : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
            }`}
            title={isPhysicsFrozen ? "Resume particle movement" : "Freeze node layout"}
          >
            {isPhysicsFrozen ? "Paused" : "Float"}
          </button>

          {/* Zoom In / Out / Reset / Fit */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z * 1.2, 3.5))}
            className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors cursor-pointer"
            title="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z * 0.8, 0.3))}
            className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors cursor-pointer"
            title="Zoom Out"
          >
            &minus;
          </button>
          <button
            type="button"
            onClick={handleZoomToFit}
            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors cursor-pointer"
            title="Fit graph to viewport"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors cursor-pointer"
            title="Reset Pan and Zoom"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Interactive Canvas Viewport */}
      <div className="relative w-full h-[540px] bg-[#0b0d10] select-none overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`w-full h-full block ${getCanvasCursor()}`}
        />

        {/* Canvas Legend & Flow Direction Guide */}
        <div className="absolute top-3 left-3 flex items-center gap-3 text-[11px] bg-neutral-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-300 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Caller (Inbound)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
            <span>Import (Outbound)</span>
          </div>
        </div>

        {/* Instructions Bar */}
        <div className="absolute bottom-3 left-3 text-[11px] text-neutral-500 bg-neutral-900/80 backdrop-blur px-2.5 py-1 rounded border border-neutral-800 pointer-events-none">
          Click node to inspect &bull; Drag to pan &bull; Wheel to zoom &bull; Arrows show dependency flow
        </div>

        {/* Dedicated Node Inspector Slide-out Drawer */}
        {selectedNode && (
          <NodeInspectorDrawer
            owner={owner}
            repo={repo}
            node={selectedNode.rawNode}
            allEdges={graph.edges}
            onClose={handleCloseInspector}
            onSelectNode={(targetId) => centerOnNode(targetId)}
          />
        )}
      </div>
    </div>
  );
}
