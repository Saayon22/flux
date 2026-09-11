// Drawer component for deep AST node inspection and source viewing.
"use client";

import React, { useState, useEffect } from "react";
import { GraphNode, GraphEdge, fetchFileContent, FileContentResponse } from "../lib/api";
import {
  FileCode,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Layers,
  Copy,
  Check,
  Code2,
  Terminal,
} from "lucide-react";

interface NodeInspectorDrawerProps {
  owner: string;
  repo: string;
  node: GraphNode;
  allEdges: GraphEdge[];
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

// Renders slide-in drawer with graph connections, AST symbols, and live code.
export default function NodeInspectorDrawer({
  owner,
  repo,
  node,
  allEdges,
  onClose,
  onSelectNode,
}: NodeInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<"connections" | "code" | "symbols">("connections");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeData, setCodeData] = useState<FileContentResponse | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const inboundDependencies = allEdges
    .filter((e) => e.target === node.id)
    .map((e) => e.source);

  const outboundDependencies = allEdges
    .filter((e) => e.source === node.id)
    .map((e) => e.target);

  useEffect(() => {
    if (activeTab === "code" && !codeData && !codeLoading) {
      setCodeLoading(true);
      setCodeError(null);
      fetchFileContent(owner, repo, node.id)
        .then((data) => {
          setCodeData(data);
          setCodeLoading(false);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to load source file.";
          setCodeError(msg);
          setCodeLoading(false);
        });
    }
  }, [activeTab, codeData, codeLoading, owner, repo, node.id]);

  useEffect(() => {
    setCodeData(null);
    setCodeError(null);
  }, [node.id]);

  // Listens for Escape key to close the inspector drawer.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Copies text to clipboard and shows transient confirmation.
  const copyToClipboard = (text: string, type: "path" | "code") => {
    navigator.clipboard.writeText(text);
    if (type === "path") {
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="node-inspector-drawer absolute top-0 right-0 h-full w-[430px] max-w-full bg-[#fffefa]/98 backdrop-blur-2xl border-l border-[rgba(23,24,23,0.14)] shadow-2xl z-40 flex flex-col transition-all duration-300 text-[#171817]">
      {/* Drawer Header */}
      <div className="p-6 border-b border-[rgba(23,24,23,0.1)] bg-[rgba(247,244,236,0.65)] flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 text-[10px] font-code uppercase tracking-wider rounded-md bg-[#df7d4c] text-[#fffdf8] font-bold">
              {node.language}
            </span>
            <span className="px-2.5 py-0.5 text-[10px] font-code bg-[rgba(23,24,23,0.06)] text-[#171817] rounded-md border border-[rgba(23,24,23,0.12)]">
              Cluster #{node.cluster}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-[#df7d4c] shrink-0" />
            <h3 className="text-base font-bold text-[#171817] truncate" title={node.id}>
              {node.label}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-[11px] font-code text-[#6b6963] truncate max-w-xs" title={node.id}>
              {node.id}
            </p>
            <button
              type="button"
              onClick={() => copyToClipboard(node.id, "path")}
              aria-label="Copy file path to clipboard"
              className="text-[rgba(23,24,23,0.5)] hover:text-[#df7d4c] transition-colors p-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] rounded-xs"
              title="Copy file path"
            >
              {copiedPath ? <Check className="w-3.5 h-3.5 text-[#df7d4c]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close node inspector drawer"
          className="p-2 rounded-xl text-[#6b6963] hover:text-[#171817] hover:bg-[rgba(23,24,23,0.08)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
          title="Close Inspector"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-4 gap-2.5 p-4 bg-[rgba(247,244,236,0.8)] border-b border-[rgba(23,24,23,0.1)] text-center">
        <div className="p-2 bg-[#fffefa] rounded-xl border border-[rgba(23,24,23,0.08)] shadow-xs">
          <div className="text-[10px] text-[#6b6963] uppercase font-bold">In-Degree</div>
          <div className="font-bold text-[#171817] text-sm mt-0.5">{node.in_degree}</div>
        </div>
        <div className="p-2 bg-[#fffefa] rounded-xl border border-[rgba(23,24,23,0.08)] shadow-xs">
          <div className="text-[10px] text-[#6b6963] uppercase font-bold">Out-Degree</div>
          <div className="font-bold text-[#df7d4c] text-sm mt-0.5">{node.out_degree}</div>
        </div>
        <div className="p-2 bg-[#fffefa] rounded-xl border border-[rgba(23,24,23,0.08)] shadow-xs">
          <div className="text-[10px] text-[#6b6963] uppercase font-bold">Centrality</div>
          <div className="font-bold text-[#171817] text-sm mt-0.5">
            {node.centrality ? node.centrality.toFixed(3) : "0.000"}
          </div>
        </div>
        <div className="p-2 bg-[#fffefa] rounded-xl border border-[rgba(23,24,23,0.08)] shadow-xs">
          <div className="text-[10px] text-[#6b6963] uppercase font-bold">Lines</div>
          <div className="font-bold text-[#171817] text-sm mt-0.5">{node.line_count}</div>
        </div>
      </div>

      {/* Drawer Tabs with Terracotta Active State */}
      <div role="tablist" aria-label="Node Inspector Sections" className="flex border-b border-[rgba(23,24,23,0.1)] text-xs bg-[rgba(255,254,250,0.9)]">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "connections"}
          onClick={() => setActiveTab("connections")}
          className={`flex-1 py-3 font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-2 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
            activeTab === "connections"
              ? "text-[#df7d4c] border-[#df7d4c] bg-[rgba(223,125,76,0.08)] font-bold"
              : "text-[#6b6963] border-transparent hover:text-[#171817]"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Graph ({inboundDependencies.length + outboundDependencies.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "symbols"}
          onClick={() => setActiveTab("symbols")}
          className={`flex-1 py-3 font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-2 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
            activeTab === "symbols"
              ? "text-[#df7d4c] border-[#df7d4c] bg-[rgba(223,125,76,0.08)] font-bold"
              : "text-[#6b6963] border-transparent hover:text-[#171817]"
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>AST ({node.symbols ? node.symbols.length : 0})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "code"}
          onClick={() => setActiveTab("code")}
          className={`flex-1 py-3 font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-2 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
            activeTab === "code"
              ? "text-[#df7d4c] border-[#df7d4c] bg-[rgba(223,125,76,0.08)] font-bold"
              : "text-[#6b6963] border-transparent hover:text-[#171817]"
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Source</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
        {/* TAB 1: Connections */}
        {activeTab === "connections" && (
          <div className="space-y-4">
            {/* Inbound Callers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#171817]">
                <span className="flex items-center gap-1.5 text-[#171817]">
                  <ArrowDownLeft className="w-4 h-4 text-[#df7d4c]" />
                  Imported by ({inboundDependencies.length})
                </span>
                <span className="text-[10px] text-[#6b6963] font-normal">Callers</span>
              </div>
              {inboundDependencies.length === 0 ? (
                <p className="text-[11px] text-[#6b6963] italic bg-[rgba(23,24,23,0.03)] p-3 rounded-xl border border-[rgba(23,24,23,0.08)]">
                  No other files import this module directly.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {inboundDependencies.map((depId) => (
                    <button
                      key={depId}
                      type="button"
                      onClick={() => onSelectNode(depId)}
                      className="w-full text-left p-3 rounded-xl bg-[#fffefa] hover:bg-[rgba(223,125,76,0.04)] text-[#171817] border border-[rgba(23,24,23,0.1)] hover:border-[#df7d4c] transition-all flex items-center justify-between group cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
                    >
                      <span className="truncate font-code text-[11px]">{depId}</span>
                      <span className="text-[10px] text-[#df7d4c] shrink-0 ml-2 font-bold">
                        jump &rarr;
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Outbound Imports */}
            <div className="space-y-2 pt-3 border-t border-[rgba(23,24,23,0.1)]">
              <div className="flex items-center justify-between text-xs font-bold text-[#171817]">
                <span className="flex items-center gap-1.5 text-[#df7d4c]">
                  <ArrowUpRight className="w-4 h-4 text-[#df7d4c]" />
                  Imports ({outboundDependencies.length})
                </span>
                <span className="text-[10px] text-[#6b6963] font-normal">Dependencies</span>
              </div>
              {outboundDependencies.length === 0 ? (
                <p className="text-[11px] text-[#6b6963] italic bg-[rgba(23,24,23,0.03)] p-3 rounded-xl border border-[rgba(23,24,23,0.08)]">
                  No local dependencies imported.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {outboundDependencies.map((depId) => (
                    <button
                      key={depId}
                      type="button"
                      onClick={() => onSelectNode(depId)}
                      className="w-full text-left p-3 rounded-xl bg-[#fffefa] hover:bg-[rgba(223,125,76,0.04)] text-[#171817] border border-[rgba(23,24,23,0.1)] hover:border-[#df7d4c] transition-all flex items-center justify-between group cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
                    >
                      <span className="truncate font-code text-[11px]">{depId}</span>
                      <span className="text-[10px] text-[#df7d4c] shrink-0 ml-2 font-bold">
                        jump &rarr;
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: AST Symbols */}
        {activeTab === "symbols" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#6b6963]">
              <span>Parsed AST Symbols</span>
              <span className="font-code text-[#171817] font-bold">{node.symbols ? node.symbols.length : 0} items</span>
            </div>

            {!node.symbols || node.symbols.length === 0 ? (
              <p className="text-[11px] text-[#6b6963] italic bg-[rgba(23,24,23,0.03)] p-4 rounded-xl border border-[rgba(23,24,23,0.08)]">
                No function or class definitions extracted from this file.
              </p>
            ) : (
              <div className="space-y-2">
                {node.symbols.map((sym, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#fffefa] rounded-xl border border-[rgba(23,24,23,0.1)] space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#171817] font-code text-[11px] truncate">
                        {sym.name}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 bg-[#df7d4c] text-[#fffdf8] rounded-md font-bold uppercase font-code">
                        {sym.type || "symbol"}
                      </span>
                    </div>
                    {sym.start_line && (
                      <div className="text-[10px] text-[#6b6963] font-code">
                        Lines {sym.start_line} - {sym.end_line}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Live Source Code */}
        {activeTab === "code" && (
          <div className="space-y-3">
            {codeLoading && (
              <div className="p-8 text-center text-[#6b6963] text-xs">
                Loading source from workspace...
              </div>
            )}

            {codeError && (
              <div className="p-3.5 alert-terracotta-error rounded-xl text-xs font-code">
                {codeError}
              </div>
            )}

            {codeData && !codeLoading && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[#6b6963]">
                  <span className="font-code text-[#171817] font-bold">{codeData.line_count} lines</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(codeData.content, "code")}
                    aria-label="Copy source code to clipboard"
                    className="btn-white px-3 py-1 text-xs cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-[#df7d4c]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="bg-[#f4efe6] rounded-xl border border-[rgba(23,24,23,0.12)] p-4 overflow-x-auto max-h-[480px] text-[11px] leading-relaxed text-[#171817]">
                  <pre className="font-code">{codeData.content}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
