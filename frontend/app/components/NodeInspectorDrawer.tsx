"use client";

/**
 * NodeInspectorDrawer.tsx
 * Akaru Prestige Edition: AST Node & Code Inspector Drawer.
 */

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
    if (activeTab !== "code") return;
    let isMounted = true;
    setCodeLoading(true);
    setCodeError(null);

    fetchFileContent(owner, repo, node.id)
      .then((data) => {
        if (isMounted) {
          setCodeData(data);
          setCodeLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setCodeError(err.message || "Failed to load file contents");
          setCodeLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [owner, repo, node.id, activeTab]);

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
    <div className="absolute top-0 right-0 h-full w-[430px] max-w-full akaru-dropdown border-l border-white/20 shadow-2xl z-40 flex flex-col transition-all duration-300">
      {/* Drawer Header */}
      <div className="p-6 border-b border-white/10 bg-[#141414] flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 text-[10px] font-code uppercase tracking-wider rounded-md bg-[#e49366] text-[#0e0e0e] font-bold">
              {node.language}
            </span>
            <span className="px-2.5 py-0.5 text-[10px] font-code bg-white/10 text-white rounded-md border border-white/20">
              Cluster #{node.cluster}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-[#e49366] shrink-0" />
            <h3 className="text-base font-bold text-white truncate" title={node.id}>
              {node.label}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-[11px] font-code text-[#9e9e9e] truncate max-w-xs" title={node.id}>
              {node.id}
            </p>
            <button
              type="button"
              onClick={() => copyToClipboard(node.id, "path")}
              className="text-white/60 hover:text-[#e49366] transition-colors p-0.5 cursor-pointer"
              title="Copy file path"
            >
              {copiedPath ? <Check className="w-3.5 h-3.5 text-[#e49366]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Close Inspector"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-4 gap-2.5 p-4 bg-[#0e0e0e] border-b border-white/10 text-center">
        <div className="p-2 bg-[#171717] rounded-xl border border-white/10">
          <div className="text-[10px] text-[#9e9e9e] uppercase font-bold">In-Degree</div>
          <div className="font-bold text-white text-sm mt-0.5">{node.in_degree}</div>
        </div>
        <div className="p-2 bg-[#171717] rounded-xl border border-white/10">
          <div className="text-[10px] text-[#9e9e9e] uppercase font-bold">Out-Degree</div>
          <div className="font-bold text-[#e49366] text-sm mt-0.5">{node.out_degree}</div>
        </div>
        <div className="p-2 bg-[#171717] rounded-xl border border-white/10">
          <div className="text-[10px] text-[#9e9e9e] uppercase font-bold">Centrality</div>
          <div className="font-bold text-white text-sm mt-0.5">
            {node.centrality ? node.centrality.toFixed(3) : "0.000"}
          </div>
        </div>
        <div className="p-2 bg-[#171717] rounded-xl border border-white/10">
          <div className="text-[10px] text-[#9e9e9e] uppercase font-bold">Lines</div>
          <div className="font-bold text-white text-sm mt-0.5">{node.line_count}</div>
        </div>
      </div>

      {/* Drawer Tabs with Bright Active States */}
      <div className="flex border-b border-white/10 text-xs bg-[#141414]">
        <button
          type="button"
          onClick={() => setActiveTab("connections")}
          className={`flex-1 py-3 font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-2 border-b-2 ${
            activeTab === "connections"
              ? "text-[#e49366] border-[#e49366] bg-white/5 font-bold"
              : "text-white/60 border-transparent hover:text-white"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Graph ({inboundDependencies.length + outboundDependencies.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("symbols")}
          className={`flex-1 py-3 font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-2 border-b-2 ${
            activeTab === "symbols"
              ? "text-[#e49366] border-[#e49366] bg-white/5 font-bold"
              : "text-white/60 border-transparent hover:text-white"
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>AST ({node.symbols ? node.symbols.length : 0})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("code")}
          className={`flex-1 py-3 font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-2 border-b-2 ${
            activeTab === "code"
              ? "text-[#e49366] border-[#e49366] bg-white/5 font-bold"
              : "text-white/60 border-transparent hover:text-white"
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
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-1.5 text-white">
                  <ArrowDownLeft className="w-4 h-4 text-[#e49366]" />
                  Imported by ({inboundDependencies.length})
                </span>
                <span className="text-[10px] text-[#9e9e9e] font-normal">Callers</span>
              </div>
              {inboundDependencies.length === 0 ? (
                <p className="text-[11px] text-[#9e9e9e] italic bg-[#0e0e0e] p-3 rounded-xl border border-white/10">
                  No other files import this module directly.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {inboundDependencies.map((depId) => (
                    <button
                      key={depId}
                      type="button"
                      onClick={() => onSelectNode(depId)}
                      className="w-full text-left p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#242424] text-white border border-white/10 hover:border-[#e49366] transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <span className="truncate font-code text-[11px]">{depId}</span>
                      <span className="text-[10px] text-[#e49366] shrink-0 ml-2 font-bold">
                        jump &rarr;
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Outbound Imports */}
            <div className="space-y-2 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-1.5 text-[#e49366]">
                  <ArrowUpRight className="w-4 h-4 text-[#e49366]" />
                  Imports ({outboundDependencies.length})
                </span>
                <span className="text-[10px] text-[#9e9e9e] font-normal">Dependencies</span>
              </div>
              {outboundDependencies.length === 0 ? (
                <p className="text-[11px] text-[#9e9e9e] italic bg-[#0e0e0e] p-3 rounded-xl border border-white/10">
                  No local dependencies imported.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {outboundDependencies.map((depId) => (
                    <button
                      key={depId}
                      type="button"
                      onClick={() => onSelectNode(depId)}
                      className="w-full text-left p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#242424] text-white border border-white/10 hover:border-[#e49366] transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <span className="truncate font-code text-[11px]">{depId}</span>
                      <span className="text-[10px] text-[#e49366] shrink-0 ml-2 font-bold">
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
            <div className="flex items-center justify-between text-xs text-[#9e9e9e]">
              <span>Parsed AST Symbols</span>
              <span className="font-code text-white font-bold">{node.symbols ? node.symbols.length : 0} items</span>
            </div>

            {!node.symbols || node.symbols.length === 0 ? (
              <p className="text-[11px] text-[#9e9e9e] italic bg-[#0e0e0e] p-4 rounded-xl border border-white/10">
                No function or class definitions extracted from this file.
              </p>
            ) : (
              <div className="space-y-2">
                {node.symbols.map((sym, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#1a1a1a] rounded-xl border border-white/10 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-code text-[11px] truncate">
                        {sym.name}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 bg-[#e49366] text-[#0e0e0e] rounded-md font-bold uppercase font-code">
                        {sym.type || "symbol"}
                      </span>
                    </div>
                    {sym.start_line && (
                      <div className="text-[10px] text-[#9e9e9e] font-code">
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
              <div className="p-8 text-center text-[#9e9e9e] text-xs">
                Loading source from workspace...
              </div>
            )}

            {codeError && (
              <div className="p-3.5 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs">
                {codeError}
              </div>
            )}

            {codeData && !codeLoading && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[#9e9e9e]">
                  <span className="font-code text-white font-bold">{codeData.line_count} lines</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(codeData.content, "code")}
                    className="btn-white px-3 py-1 text-xs cursor-pointer flex items-center gap-1.5"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="bg-[#0e0e0e] rounded-xl border border-white/15 p-4 overflow-x-auto max-h-[480px] text-[11px] leading-relaxed text-white">
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
