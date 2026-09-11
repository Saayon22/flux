"use client";

/**
 * ObsidianGraphCanvas.tsx
 * Akaru Prestige Edition: AST Dependency Network Explorer.
 * Features:
 * - Deterministic, static node layout (no uncontrolled drift).
 * - Continuous high-frequency network micro-animations (warm terracotta pulses, radar ripples, laser flow arrows).
 * - Akaru color schema: Warm Terracotta (#e49366), gallery near-black (#0e0e0e), crisp white (#ffffff).
 * - Interactive hover pop-up card and deep node inspection.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { GraphResponse, GraphNode, GraphEdge } from "../lib/api";
import NodeInspectorDrawer from "./NodeInspectorDrawer";
import {
  Search,
  Maximize2,
  RotateCcw,
  Plus,
  Minus,
  Filter,
  Layers,
  ArrowRight,
  Activity,
  FileCode,
} from "lucide-react";

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
  radius: number;
  isDragging?: boolean;
}

interface SimEdge {
  source: string;
  target: string;
  speed: number;
  pulsePhase: number;
}

// Akaru-Harmonized Palette (Warm Terracotta, Gold, Sky Azure, Pure White, Mint - Zero Purple)
const AKARU_CLUSTERS = [
  { color: "#e49366", name: "Terracotta Primary" },
  { color: "#ffffff", name: "Pure White" },
  { color: "#f59e0b", name: "Warm Gold" },
  { color: "#38bdf8", name: "Sky Azure" },
  { color: "#10b981", name: "Mint Emerald" },
  { color: "#fb7185", name: "Coral Rose" },
  { color: "#9e9e9e", name: "Neutral Gray" },
];

export default function ObsidianGraphCanvas({
  owner,
  repo,
  graph,
  focusedNodeId,
  onClearFocus,
}: ObsidianGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport transforms
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [hoverScreenPos, setHoverScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);

  // Filtering & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedClusterFilter, setSelectedClusterFilter] = useState<number | "all">("all");
  const [minDegreeFilter, setMinDegreeFilter] = useState<number>(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });

  // Simulation Refs
  const isPanningRef = useRef(false);
  const startPanRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<SimNode | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const animFrameIdRef = useRef<number | null>(null);
  const tickCounterRef = useRef(0);

  // Color helper
  const getNodeColor = useCallback((node: SimNode): string => {
    if (node.cluster !== undefined && node.cluster >= 0) {
      return AKARU_CLUSTERS[node.cluster % AKARU_CLUSTERS.length].color;
    }
    switch (node.language.toLowerCase()) {
      case "python":
        return "#e49366";
      case "javascript":
      case "typescript":
        return "#ffffff";
      case "go":
        return "#38bdf8";
      case "rust":
        return "#f59e0b";
      default:
        return "#9e9e9e";
    }
  }, []);

  // Compute Static, Balanced Layout Once When Graph Prop Changes
  useEffect(() => {
    const width = 940;
    const height = 580;
    const totalNodes = Math.max(graph.nodes.length, 1);

    const simNodes: SimNode[] = graph.nodes.map((n, idx) => {
      const clusterOffset = (n.cluster || 0) * (Math.PI / 3.5);
      const angle = (idx / totalNodes) * 2 * Math.PI + clusterOffset;
      const baseDist = 175;
      const clusterScatter = ((idx % 4) - 1.5) * 40;
      const radiusDist = baseDist + clusterScatter;

      const baseRadius = 7.5;
      const bonus = Math.min(n.in_degree * 2.2 + n.centrality * 14, 16);

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
        x: width / 2 + Math.cos(angle) * radiusDist,
        y: height / 2 + Math.sin(angle) * radiusDist,
        radius: baseRadius + bonus,
      };
    });

    // Run quick relaxation passes (70 iterations) then FREEZE STATICALLY
    const nodeMap = new Map<string, SimNode>();
    simNodes.forEach((n) => nodeMap.set(n.id, n));

    for (let iter = 0; iter < 70; iter++) {
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i];
          const b = simNodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);
          if (dist < 125) {
            const force = (125 - dist) * 0.08;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.x -= fx;
            a.y -= fy;
            b.x += fx;
            b.y += fy;
          }
        }
      }

      for (const e of graph.edges) {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist > 165) {
          const force = (dist - 165) * 0.02;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          src.x += fx;
          src.y += fy;
          tgt.x -= fx;
          tgt.y -= fy;
        }
      }
    }

    const simEdges: SimEdge[] = graph.edges.map((e, idx) => ({
      source: e.source,
      target: e.target,
      speed: 0.008 + (idx % 3) * 0.004,
      pulsePhase: (idx * 0.21) % 1,
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

  useEffect(() => {
    if (focusedNodeId) {
      centerOnNode(focusedNodeId);
    }
  }, [focusedNodeId, centerOnNode]);

  const availableClusters = useMemo(() => {
    const set = new Set<number>();
    graph.nodes.forEach((n) => {
      if (n.cluster !== undefined && n.cluster >= 0) set.add(n.cluster);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [graph.nodes]);

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

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return graph.nodes
      .filter((n) => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [graph.nodes, searchQuery]);

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

    const padding = 80;
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;

    const scaleX = rect.width / graphWidth;
    const scaleY = rect.height / graphHeight;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.6);

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    setZoom(newZoom);
    setPan({
      x: rect.width / 2 - midX * newZoom,
      y: rect.height / 2 - midY * newZoom,
    });
  };

  // Continuous Canvas Rendering Loop with Active Network Micro-Animations
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      tickCounterRef.current += 1;
      const tTime = tickCounterRef.current * 0.02;

      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      // Viewport transform
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeMap = new Map<string, SimNode>();
      nodes.forEach((n) => nodeMap.set(n.id, n));

      const activeTarget = hoveredNode || selectedNode;

      // 1. Draw thin ink connections first, then animate a restrained signal over them.
      for (const edge of edges) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;

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

        // Base connection line
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);

        if (isOutbound) {
          ctx.strokeStyle = "rgba(223, 125, 76, 0.8)";
          ctx.lineWidth = 1.6 / zoom;
        } else if (isInbound) {
          ctx.strokeStyle = "rgba(23, 24, 23, 0.72)";
          ctx.lineWidth = 1.6 / zoom;
        } else if (activeTarget) {
          ctx.strokeStyle = "rgba(23, 24, 23, 0.045)";
          ctx.lineWidth = 0.7 / zoom;
        } else {
          ctx.strokeStyle = "rgba(23, 24, 23, 0.16)";
          ctx.lineWidth = 0.85 / zoom;
        }
        ctx.stroke();

        // 2. High-Frequency Micro-Animation: Data Pulse travelling on the wire
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 35) {
          const phase = (tTime * 0.8 + edge.pulsePhase) % 1;
          const px = src.x + dx * phase;
          const py = src.y + dy * phase;

          ctx.beginPath();
          ctx.arc(px, py, (isHighlighted ? 2.8 : 1.7) / zoom, 0, 2 * Math.PI);
          ctx.fillStyle = isOutbound
            ? "#df7d4c"
            : isInbound
            ? "#171817"
            : isHighlighted
            ? "#f59e0b"
            : "rgba(223, 125, 76, 0.86)";
          ctx.fill();

          if (isHighlighted) {
            ctx.beginPath();
            ctx.arc(px, py, 6.5 / zoom, 0, 2 * Math.PI);
            ctx.fillStyle = isOutbound ? "rgba(223, 125, 76, 0.18)" : "rgba(23, 24, 23, 0.12)";
            ctx.fill();
          }
        }

        // 3. Directional Arrowhead
        if (dist > tgt.radius + 15) {
          const offsetDist = dist - tgt.radius - 3;
          const arrowX = src.x + (dx / dist) * offsetDist;
          const arrowY = src.y + (dy / dist) * offsetDist;
          const angle = Math.atan2(dy, dx);
          const arrowLength = (isHighlighted ? 7.0 : 5.0) / zoom;

          ctx.save();
          ctx.translate(arrowX, arrowY);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-arrowLength, -arrowLength * 0.45);
          ctx.lineTo(-arrowLength, arrowLength * 0.45);
          ctx.closePath();
          ctx.fillStyle = isOutbound ? "#df7d4c" : isInbound ? "#171817" : "rgba(23, 24, 23, 0.3)";
          ctx.fill();
          ctx.restore();
        }
      }

      // 4. Draw compact module tiles with a small live core and a readable label.
      for (const node of nodes) {
        const clusterMatch =
          selectedClusterFilter === "all" || node.cluster === selectedClusterFilter;
        const degreeMatch = node.in_degree + node.out_degree >= minDegreeFilter;
        const isFilterActive = selectedClusterFilter !== "all" || minDegreeFilter > 0;

        if (isFilterActive && (!clusterMatch || !degreeMatch)) {
          continue;
        }

        const isConnected = !activeTarget || connectedIds.has(node.id);
        const isFocused = activeTarget && activeTarget.id === node.id;
        const isHovered = hoveredNode && hoveredNode.id === node.id;
        const nodeColor = getNodeColor(node);

        ctx.save();

        // Animated radar beacon around hub nodes
        if (node.in_degree >= 2 || isFocused) {
          const ripplePhase = (tTime * 0.7 + (node.cluster || 0)) % 1;
          const rippleRadius = node.radius + ripplePhase * (isFocused ? 18 : 12);
          const rippleOpacity = (1 - ripplePhase) * (isFocused ? 0.7 : 0.35);

          ctx.beginPath();
          ctx.arc(node.x, node.y, rippleRadius, 0, 2 * Math.PI);
          ctx.strokeStyle = isFocused
            ? `rgba(223, 125, 76, ${rippleOpacity})`
            : `rgba(23, 24, 23, ${rippleOpacity * 0.65})`;
          ctx.lineWidth = 1.2 / zoom;
          ctx.stroke();
        }

        // Outer aura glow
        if (isFocused || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 9, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(223, 125, 76, 0.16)";
          ctx.fill();
        }

        // Soft rounded-square module tile, rotated slightly to separate nodes from points.
        const tileSize = node.radius * 1.7;
        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.roundRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize, 4 / zoom);
        ctx.fillStyle = isConnected ? "#fffefa" : "rgba(255, 254, 250, 0.6)";
        ctx.fill();
        ctx.strokeStyle = isFocused ? "#171817" : isConnected ? nodeColor : "rgba(23, 24, 23, 0.22)";
        ctx.lineWidth = (isFocused ? 2.4 : isHovered ? 2 : 1.2) / zoom;
        ctx.stroke();
        ctx.restore();

        // Live center marker
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(node.radius * 0.28, 2.5), 0, 2 * Math.PI);
        ctx.fillStyle = isConnected ? nodeColor : "rgba(23, 24, 23, 0.26)";
        ctx.fill();

        // Node Label
        const showLabel = isFocused || isHovered || isConnected || zoom >= 0.95 || node.in_degree > 1;
        if (showLabel) {
          ctx.font = `600 ${Math.max(10 / zoom, 9)}px var(--font-display, sans-serif)`;
          ctx.textAlign = "center";
          ctx.fillStyle = isFocused || isHovered ? "#171817" : isConnected ? "#4e4d49" : "rgba(78, 77, 73, 0.38)";
          ctx.fillText(node.label, node.x, node.y + node.radius + 13 / zoom);
        }

        ctx.restore();
      }

      ctx.restore();

      if (isRunning) {
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
    getNodeColor,
  ]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = 580 * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `580px`;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const screenToCanvas = (screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (screenX - rect.left - pan.x) / zoom;
    const y = (screenY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  const findNodeAt = (canvasX: number, canvasY: number): SimNode | null => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const clusterMatch =
        selectedClusterFilter === "all" || n.cluster === selectedClusterFilter;
      const degreeMatch = n.in_degree + n.out_degree >= minDegreeFilter;
      if (selectedClusterFilter !== "all" || minDegreeFilter > 0) {
        if (!clusterMatch || !degreeMatch) continue;
      }

      const dx = n.x - canvasX;
      const dy = n.y - canvasY;
      const hitRadius = Math.max(n.radius + 12, 18);
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return n;
      }
    }
    return null;
  };

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
    } else if (isPanningRef.current) {
      setPan({
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y,
      });
    } else {
      const node = findNodeAt(x, y);
      setHoveredNode(node);
      if (node) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          setHoverScreenPos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
        }
      } else {
        setHoverScreenPos(null);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const distMoved = Math.hypot(
      e.clientX - mouseDownPosRef.current.x,
      e.clientY - mouseDownPosRef.current.y
    );

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
    <div className="graph-shell akaru-card overflow-hidden shadow-2xl relative select-none">
      {/* Top Controls Toolbar */}
      <div className="graph-toolbar flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-white/10 bg-[#161616] text-xs">
        {/* Left: Summary Metrics & Search */}
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#e49366] animate-pulse"></span>
            <span className="font-bold text-white uppercase tracking-wider text-[11px]">
              Dependency Network
            </span>
          </div>
          <span className="text-white/20">|</span>
          <span className="text-white font-medium">{graph.metrics.total_nodes} modules</span>
          <span className="text-white/20">&bull;</span>
          <span className="text-white font-medium">{graph.metrics.total_edges} connections</span>

          {/* Quick Node Search */}
          <div className="relative ml-2">
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-[#0e0e0e] border border-white/15 rounded-xl focus-within:border-[#e49366] transition-all">
              <Search className="w-3.5 h-3.5 text-[#e49366]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Find node or module..."
                className="bg-transparent text-white placeholder-white/40 text-xs focus:outline-none w-44 font-code"
              />
            </div>
            {isSearchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 mt-2 w-72 akaru-dropdown shadow-2xl z-40 py-2 max-h-52 overflow-y-auto">
                {searchResults.map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      centerOnNode(res.id);
                      setIsSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#222222] text-xs font-code text-white hover:text-[#e49366] flex items-center justify-between group cursor-pointer"
                  >
                    <span className="truncate">{res.id}</span>
                    <span className="text-[10px] text-white/50 group-hover:text-[#e49366]">
                      deg:{res.in_degree + res.out_degree}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Viewport & Declutter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Cluster Filter */}
          {availableClusters.length > 1 && (
            <select
              value={selectedClusterFilter}
              onChange={(e) =>
                setSelectedClusterFilter(
                  e.target.value === "all" ? "all" : parseInt(e.target.value, 10)
                )
              }
              className="px-3.5 py-1.5 bg-[#0e0e0e] border border-white/20 rounded-xl text-xs text-white focus:outline-none cursor-pointer hover:border-[#e49366]"
            >
              <option value="all">All Clusters ({availableClusters.length})</option>
              {availableClusters.map((c) => (
                <option key={c} value={c}>
                  Cluster #{c}
                </option>
              ))}
            </select>
          )}

          {/* Min Degree Filter */}
          <button
            type="button"
            onClick={() => setMinDegreeFilter((prev) => (prev === 0 ? 1 : prev === 1 ? 2 : 0))}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
              minDegreeFilter > 0
                ? "bg-[#e49366] text-[#0e0e0e] border-[#e49366]"
                : "bg-white text-[#0e0e0e] border-white hover:bg-[#f2f2f2]"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>
              {minDegreeFilter === 0
                ? "All Nodes"
                : minDegreeFilter === 1
                ? "Connected (≥1)"
                : "Hubs (≥2)"}
            </span>
          </button>

          {/* Zoom Buttons with Bright Non-Dark Styling */}
          <div className="flex items-center bg-white text-[#0e0e0e] rounded-xl overflow-hidden shadow-sm font-bold">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(z * 1.2, 3.5))}
              className="p-2 hover:bg-slate-100 text-[#0e0e0e] transition-colors cursor-pointer"
              title="Zoom In"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(z * 0.8, 0.3))}
              className="p-2 hover:bg-slate-100 text-[#0e0e0e] transition-colors cursor-pointer border-l border-slate-200"
              title="Zoom Out"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomToFit}
              className="p-2 hover:bg-slate-100 text-[#0e0e0e] transition-colors cursor-pointer border-l border-slate-200"
              title="Fit to Screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-2 hover:bg-slate-100 text-[#0e0e0e] transition-colors cursor-pointer border-l border-slate-200"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Canvas Viewport */}
      <div className="graph-viewport relative w-full h-[580px] bg-[#0e0e0e] overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`w-full h-full block ${isInteracting ? "cursor-grabbing" : hoveredNode ? "cursor-pointer" : "cursor-grab"}`}
        />

        {/* Dynamic Interactive Hover Pop-Up Card */}
        {hoveredNode && hoverScreenPos && !selectedNode && (
          <div
            className="absolute z-30 pointer-events-none akaru-dropdown p-4 shadow-2xl border border-[#e49366]/40 text-xs text-white transition-opacity duration-150 space-y-2.5 min-w-64"
            style={{
              left: Math.min(Math.max(hoverScreenPos.x + 18, 14), 660),
              top: Math.min(Math.max(hoverScreenPos.y - 40, 14), 440),
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
              <span className="font-bold text-white truncate max-w-44 text-sm">{hoveredNode.label}</span>
              <span className="text-[10px] px-2 py-0.5 bg-[#e49366] text-[#0e0e0e] rounded-md font-bold uppercase">
                {hoveredNode.language}
              </span>
            </div>
            <div className="text-[11px] font-code text-[#9e9e9e] truncate">{hoveredNode.id}</div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-1.5 bg-[#171717] rounded-lg border border-white/10">
                <div className="text-[9px] text-[#9e9e9e] uppercase font-bold">Callers</div>
                <strong className="text-white text-xs">{hoveredNode.in_degree}</strong>
              </div>
              <div className="p-1.5 bg-[#171717] rounded-lg border border-white/10">
                <div className="text-[9px] text-[#9e9e9e] uppercase font-bold">Imports</div>
                <strong className="text-[#e49366] text-xs">{hoveredNode.out_degree}</strong>
              </div>
              <div className="p-1.5 bg-[#171717] rounded-lg border border-white/10">
                <div className="text-[9px] text-[#9e9e9e] uppercase font-bold">Lines</div>
                <strong className="text-white text-xs">{hoveredNode.line_count}</strong>
              </div>
            </div>
            <div className="text-[10px] text-[#e49366] pt-0.5 flex items-center justify-between font-semibold">
              <span>Click node to inspect AST &amp; code</span>
              <span>&rarr;</span>
            </div>
          </div>
        )}

        {/* Legend Overlay */}
        <div className="absolute top-4 left-4 flex items-center gap-4 text-xs font-semibold akaru-card-sm px-4 py-2 text-white pointer-events-none shadow-lg">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-white"></span>
            <span>Caller (Inbound)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#e49366]"></span>
            <span>Import (Outbound)</span>
          </div>
        </div>

        {/* Instructions Footer */}
        <div className="absolute bottom-4 left-4 text-[11px] text-[#9e9e9e] akaru-card-sm px-3.5 py-1.5 pointer-events-none shadow-lg font-medium">
          Click any module to inspect AST &bull; Drag to pan &bull; Scroll to zoom
        </div>

        {/* Dedicated Node Inspector Drawer */}
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
