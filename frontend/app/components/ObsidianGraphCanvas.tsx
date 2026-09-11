"use client";

// Interactive AST dependency network explorer canvas with warm gallery styling.

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

// Akaru-harmonized cluster palette with high contrast on warm canvas.
const AKARU_CLUSTERS = [
  { color: "#df7d4c", name: "Terracotta Primary" },
  { color: "#2a2c2b", name: "Slate Charcoal" },
  { color: "#d97706", name: "Warm Amber" },
  { color: "#0284c7", name: "Sky Azure" },
  { color: "#059669", name: "Mint Emerald" },
  { color: "#e11d48", name: "Coral Rose" },
  { color: "#6b7280", name: "Neutral Slate" },
];

// Renders interactive canvas dependency network with energy pulses and inspector drawer.
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

  // Resolves color token for graph node by community cluster or programming language.
  const getNodeColor = useCallback((node: SimNode): string => {
    if (node.cluster !== undefined && node.cluster >= 0) {
      return AKARU_CLUSTERS[node.cluster % AKARU_CLUSTERS.length].color;
    }
    switch (node.language.toLowerCase()) {
      case "python":
        return "#df7d4c";
      case "javascript":
      case "typescript":
        return "#2a2c2b";
      case "go":
        return "#0284c7";
      case "rust":
        return "#d97706";
      default:
        return "#6b7280";
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

  // Centers viewport on a specific node with smooth animation and zoom scale.
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

  // Adjusts pan and zoom scale to fit entire dependency network within canvas bounds.
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
          const offsetDist = dist - tgt.radius - 2.5 / zoom;
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

      // 4. Draw circular nodes with high-contrast cluster fills and clean centered labels underneath.
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

        // Animated radar beacon around hub nodes or focused node
        if (node.in_degree >= 2 || isFocused) {
          const ripplePhase = (tTime * 0.7 + (node.cluster || 0)) % 1;
          const rippleRadius = node.radius + ripplePhase * (isFocused ? 20 : 13);
          const rippleOpacity = (1 - ripplePhase) * (isFocused ? 0.75 : 0.35);

          ctx.beginPath();
          ctx.arc(node.x, node.y, rippleRadius, 0, 2 * Math.PI);
          ctx.strokeStyle = isFocused
            ? `rgba(223, 125, 76, ${rippleOpacity})`
            : `rgba(23, 24, 23, ${rippleOpacity * 0.55})`;
          ctx.lineWidth = 1.2 / zoom;
          ctx.stroke();
        }

        // Outer aura glow on focused or hovered node
        if (isFocused || isHovered) {
          const auraRadius = node.radius + (isFocused ? 8 : 6) / zoom;
          ctx.beginPath();
          ctx.arc(node.x, node.y, auraRadius, 0, 2 * Math.PI);
          ctx.fillStyle = isFocused ? "rgba(223, 125, 76, 0.22)" : "rgba(223, 125, 76, 0.14)";
          ctx.fill();
        }

        // Elevation drop shadow beneath the circle
        ctx.beginPath();
        ctx.arc(node.x, node.y + 1.8 / zoom, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = isConnected ? "rgba(23, 24, 23, 0.12)" : "rgba(23, 24, 23, 0.04)";
        ctx.fill();

        // Solid porcelain base to occlude any background connection wires
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = "#fffefa";
        ctx.fill();

        // Primary solid cluster-colored circle body
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = isConnected ? nodeColor : "rgba(107, 114, 128, 0.22)";
        ctx.fill();

        // Crisp perimeter border
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        if (isFocused) {
          ctx.strokeStyle = "#171817";
          ctx.lineWidth = 2.4 / zoom;
        } else if (isHovered) {
          ctx.strokeStyle = "#fffefa";
          ctx.lineWidth = 2.2 / zoom;
        } else if (isConnected) {
          ctx.strokeStyle = "#fffefa";
          ctx.lineWidth = 1.6 / zoom;
        } else {
          ctx.strokeStyle = "rgba(255, 254, 250, 0.6)";
          ctx.lineWidth = 1 / zoom;
        }
        ctx.stroke();

        // Additional accent reticle ring for focused node
        if (isFocused) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 3.5 / zoom, 0, 2 * Math.PI);
          ctx.strokeStyle = "#df7d4c";
          ctx.lineWidth = 1.4 / zoom;
          ctx.stroke();
        }

        // Clean module label positioned neatly at the bottom of the circle
        const showLabel =
          isFocused || isHovered || isConnected || zoom >= 0.85 || node.in_degree > 0;
        if (showLabel) {
          const fontSize = Math.max(10.5 / zoom, 9);
          ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const textMetrics = ctx.measureText(node.label);
          const textWidth = textMetrics.width;
          const pillPaddingX = Math.max(5.5 / zoom, 4.5);
          const pillHeight = Math.max(fontSize + 6 / zoom, 15 / zoom);
          const pillY = node.y + node.radius + 5 / zoom;
          const pillWidth = textWidth + pillPaddingX * 2;
          const pillX = node.x - pillWidth / 2;
          const pillRadius = 4 / zoom;

          // Translucent pill backdrop to ensure label text contrast over crossing edges
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillRadius);
          if (isFocused || isHovered) {
            ctx.fillStyle = "rgba(255, 254, 250, 0.98)";
            ctx.fill();
            ctx.strokeStyle = isFocused ? "#df7d4c" : "rgba(23, 24, 23, 0.28)";
            ctx.lineWidth = (isFocused ? 1.4 : 1) / zoom;
            ctx.stroke();
          } else if (isConnected) {
            ctx.fillStyle = "rgba(255, 254, 250, 0.88)";
            ctx.fill();
            ctx.strokeStyle = "rgba(23, 24, 23, 0.1)";
            ctx.lineWidth = 0.85 / zoom;
            ctx.stroke();
          } else {
            ctx.fillStyle = "rgba(255, 254, 250, 0.4)";
            ctx.fill();
          }

          // Label typography
          ctx.fillStyle =
            isFocused || isHovered
              ? "#171817"
              : isConnected
              ? "#2a2c2b"
              : "rgba(42, 44, 43, 0.35)";
          ctx.fillText(node.label, node.x, pillY + pillHeight / 2);
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

  // Translates client screen pixel coordinates to virtual graph canvas coordinates.
  const screenToCanvas = (screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (screenX - rect.left - pan.x) / zoom;
    const y = (screenY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  // Identifies nearest graph node matching canvas coordinate within hit radius.
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
      const hitRadius = Math.max(n.radius + 8, 16);
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return n;
      }

      // Check hit against label pill positioned beneath circular node
      const labelYStart = n.y + n.radius + 2 / zoom;
      const labelYEnd = n.y + n.radius + 24 / zoom;
      if (
        canvasY >= labelYStart &&
        canvasY <= labelYEnd &&
        Math.abs(dx) <= Math.max(n.radius + 28, 44)
      ) {
        return n;
      }
    }
    return null;
  };

  // Handles mouse down event for node dragging or viewport panning.
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

  // Tracks cursor movement for viewport panning, node dragging, and tooltip positioning.
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

  // Completes node dragging or viewport panning on mouse button release.
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

  // Adjusts viewport zoom scale on mouse wheel scrolling.
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setZoom((prev) => Math.min(Math.max(prev * factor, 0.3), 3.5));
  };

  // Dismisses node inspector drawer and resets focused node state.
  const handleCloseInspector = () => {
    setSelectedNode(null);
    if (onClearFocus) onClearFocus();
  };

  return (
    <div className="graph-shell akaru-card overflow-hidden shadow-2xl relative select-none">
      {/* Top Controls Toolbar */}
      <div className="graph-toolbar flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[rgba(23,24,23,0.1)] bg-[#fffefa]/95 text-xs text-[#171817]">
        {/* Left: Summary Metrics & Search */}
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#df7d4c] animate-pulse"></span>
            <span className="font-bold text-[#171817] uppercase tracking-wider text-[11px]">
              Dependency Network
            </span>
          </div>
          <span className="text-[rgba(23,24,23,0.2)]">|</span>
          <span className="text-[#171817] font-medium">{graph.metrics.total_nodes} modules</span>
          <span className="text-[rgba(23,24,23,0.2)]">&bull;</span>
          <span className="text-[#171817] font-medium">{graph.metrics.total_edges} connections</span>

          {/* Quick Node Search */}
          <div className="relative ml-2">
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-[#f4efe6] border border-[rgba(23,24,23,0.12)] rounded-xl focus-within:border-[#df7d4c] transition-all">
              <Search className="w-3.5 h-3.5 text-[#df7d4c]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Find node or module..."
                className="bg-transparent text-[#171817] placeholder-[rgba(23,24,23,0.45)] text-xs focus:outline-none w-44 font-code"
              />
            </div>
            {isSearchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 mt-2 w-72 akaru-dropdown shadow-2xl z-40 py-2 max-h-52 overflow-y-auto bg-[#fffefa] border border-[rgba(23,24,23,0.14)] rounded-xl">
                {searchResults.map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      centerOnNode(res.id);
                      setIsSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[rgba(223,125,76,0.08)] text-xs font-code text-[#171817] hover:text-[#df7d4c] flex items-center justify-between group cursor-pointer transition-colors"
                  >
                    <span className="truncate">{res.id}</span>
                    <span className="text-[10px] text-[rgba(23,24,23,0.45)] group-hover:text-[#df7d4c]">
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
              aria-label="Filter modules by Louvain community cluster"
              onChange={(e) =>
                setSelectedClusterFilter(
                  e.target.value === "all" ? "all" : parseInt(e.target.value, 10)
                )
              }
              className="px-3.5 py-1.5 bg-[#fffefa] border border-[rgba(23,24,23,0.14)] rounded-xl text-xs text-[#171817] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] cursor-pointer hover:border-[#df7d4c] shadow-xs"
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
            aria-label="Filter modules by connection degree"
            onClick={() => setMinDegreeFilter((prev) => (prev === 0 ? 1 : prev === 1 ? 2 : 0))}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
              minDegreeFilter > 0
                ? "bg-[#df7d4c] text-[#fffdf8] border-[#df7d4c]"
                : "bg-[#fffefa] text-[#171817] border-[rgba(23,24,23,0.14)] hover:bg-[rgba(23,24,23,0.04)]"
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

          {/* Zoom Buttons with Warm Gallery Styling */}
          <div className="flex items-center bg-[#fffefa] text-[#171817] border border-[rgba(23,24,23,0.14)] rounded-xl overflow-hidden shadow-xs font-bold">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(z * 1.2, 3.5))}
              className="p-2 hover:bg-[rgba(23,24,23,0.05)] text-[#171817] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
              title="Zoom In"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(z * 0.8, 0.3))}
              className="p-2 hover:bg-[rgba(23,24,23,0.05)] text-[#171817] transition-colors cursor-pointer border-l border-[rgba(23,24,23,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
              title="Zoom Out"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Fit graph to viewport"
              onClick={handleZoomToFit}
              className="p-2 hover:bg-[rgba(23,24,23,0.05)] text-[#171817] transition-colors cursor-pointer border-l border-[rgba(23,24,23,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
              title="Fit to Screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Reset viewport pan and zoom"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-2 hover:bg-[rgba(23,24,23,0.05)] text-[#171817] transition-colors cursor-pointer border-l border-[rgba(23,24,23,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Canvas Viewport */}
      <div className="graph-viewport relative w-full h-[580px] bg-[#fbfaf6] overflow-hidden">
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
            className="absolute z-30 pointer-events-none akaru-dropdown p-4 shadow-2xl border border-[#df7d4c]/40 text-xs text-[#171817] bg-[#fffefa]/98 transition-opacity duration-150 space-y-2.5 min-w-64"
            style={{
              left: Math.min(Math.max(hoverScreenPos.x + 18, 14), 660),
              top: Math.min(Math.max(hoverScreenPos.y - 40, 14), 440),
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[rgba(23,24,23,0.1)] pb-2">
              <span className="font-bold text-[#171817] truncate max-w-44 text-sm">{hoveredNode.label}</span>
              <span className="text-[10px] px-2 py-0.5 bg-[#df7d4c] text-[#fffdf8] rounded-md font-bold uppercase">
                {hoveredNode.language}
              </span>
            </div>
            <div className="text-[11px] font-code text-[#77756f] truncate">{hoveredNode.id}</div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-1.5 bg-[rgba(23,24,23,0.04)] rounded-lg border border-[rgba(23,24,23,0.08)]">
                <div className="text-[9px] text-[#77756f] uppercase font-bold">Callers</div>
                <strong className="text-[#171817] text-xs">{hoveredNode.in_degree}</strong>
              </div>
              <div className="p-1.5 bg-[rgba(23,24,23,0.04)] rounded-lg border border-[rgba(23,24,23,0.08)]">
                <div className="text-[9px] text-[#77756f] uppercase font-bold">Imports</div>
                <strong className="text-[#df7d4c] text-xs">{hoveredNode.out_degree}</strong>
              </div>
              <div className="p-1.5 bg-[rgba(23,24,23,0.04)] rounded-lg border border-[rgba(23,24,23,0.08)]">
                <div className="text-[9px] text-[#77756f] uppercase font-bold">Lines</div>
                <strong className="text-[#171817] text-xs">{hoveredNode.line_count}</strong>
              </div>
            </div>
            <div className="text-[10px] text-[#df7d4c] pt-0.5 flex items-center justify-between font-semibold">
              <span>Click node to inspect AST &amp; code</span>
              <span>&rarr;</span>
            </div>
          </div>
        )}

        {/* Legend Overlay */}
        <div className="absolute top-4 left-4 flex items-center gap-4 text-xs font-semibold akaru-card-sm px-4 py-2 text-[#171817] pointer-events-none shadow-md">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#171817]"></span>
            <span>Caller (Inbound)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#df7d4c]"></span>
            <span>Import (Outbound)</span>
          </div>
        </div>

        {/* Instructions Footer */}
        <div className="absolute bottom-4 left-4 text-[11px] text-[#77756f] akaru-card-sm px-3.5 py-1.5 pointer-events-none shadow-md font-medium">
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
