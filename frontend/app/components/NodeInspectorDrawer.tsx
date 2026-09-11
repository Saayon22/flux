"use client";

/**
 * NodeInspectorDrawer.tsx
 * Dedicated side drawer for deep file and function inspection in the Graph Explorer.
 * Displays node metadata, inbound/outbound dependencies, extracted AST symbols,
 * and live source code preview fetched from the local workspace.
 */

import React, { useState, useEffect } from "react";
import { GraphNode, GraphEdge, fetchFileContent, FileContentResponse } from "../lib/api";

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
  const [activeTab, setActiveTab] = useState<"connections" | "code">("connections");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeData, setCodeData] = useState<FileContentResponse | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Inbound edges: files that import this node
  const inboundDependencies = allEdges
    .filter((e) => e.target === node.id)
    .map((e) => e.source);

  // Outbound edges: files this node imports
  const outboundDependencies = allEdges
    .filter((e) => e.source === node.id)
    .map((e) => e.target);

  // Fetch file content whenever switching to 'code' tab or when node changes
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

  const getLangBadgeColor = (lang: string) => {
    switch (lang.toLowerCase()) {
      case "python":
        return "bg-emerald-950 text-emerald-300 border-emerald-800";
      case "javascript":
      case "typescript":
        return "bg-sky-950 text-sky-300 border-sky-800";
      default:
        return "bg-purple-950 text-purple-300 border-purple-800";
    }
  };

  return (
    <div className="absolute top-0 right-0 h-full w-96 max-w-full bg-neutral-900/98 backdrop-blur-md border-l border-neutral-800 shadow-2xl z-20 flex flex-col transition-transform duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-neutral-800 flex items-start justify-between gap-3 bg-neutral-950/60">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded border ${getLangBadgeColor(
                node.language
              )}`}
            >
              {node.language}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono bg-neutral-800 text-neutral-400 rounded border border-neutral-700/60">
              Cluster #{node.cluster}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-white font-mono truncate" title={node.id}>
            {node.label}
          </h3>
          <p className="text-[11px] font-mono text-neutral-500 truncate" title={node.id}>
            {node.id}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer text-base leading-none"
          title="Close Inspector"
        >
          &times;
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-4 gap-1 p-3 bg-neutral-950/40 border-b border-neutral-800 text-center text-xs">
        <div className="p-1.5 bg-neutral-900/80 rounded border border-neutral-800/80">
          <div className="text-[10px] text-neutral-500 uppercase tracking-tight">In-Degree</div>
          <div className="font-semibold text-emerald-400 text-xs mt-0.5">{node.in_degree}</div>
        </div>
        <div className="p-1.5 bg-neutral-900/80 rounded border border-neutral-800/80">
          <div className="text-[10px] text-neutral-500 uppercase tracking-tight">Out-Degree</div>
          <div className="font-semibold text-sky-400 text-xs mt-0.5">{node.out_degree}</div>
        </div>
        <div className="p-1.5 bg-neutral-900/80 rounded border border-neutral-800/80">
          <div className="text-[10px] text-neutral-500 uppercase tracking-tight">Centrality</div>
          <div className="font-semibold text-amber-400 text-xs mt-0.5">
            {node.centrality ? node.centrality.toFixed(3) : "0.000"}
          </div>
        </div>
        <div className="p-1.5 bg-neutral-900/80 rounded border border-neutral-800/80">
          <div className="text-[10px] text-neutral-500 uppercase tracking-tight">Lines</div>
          <div className="font-semibold text-neutral-300 text-xs mt-0.5">{node.line_count}</div>
        </div>
      </div>

      {/* Drawer Tabs */}
      <div className="flex border-b border-neutral-800 text-xs bg-neutral-900/60">
        <button
          type="button"
          onClick={() => setActiveTab("connections")}
          className={`flex-1 py-2.5 font-medium transition-colors cursor-pointer text-center ${
            activeTab === "connections"
              ? "text-emerald-400 border-b-2 border-emerald-500 bg-neutral-900"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Graph & Symbols
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("code")}
          className={`flex-1 py-2.5 font-medium transition-colors cursor-pointer text-center ${
            activeTab === "code"
              ? "text-emerald-400 border-b-2 border-emerald-500 bg-neutral-900"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Source Preview
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {activeTab === "connections" ? (
          <>
            {/* Dependencies (Outbound) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">
                  Imports / Dependencies ({outboundDependencies.length})
                </span>
                <span className="text-[10px] text-neutral-500">Outbound</span>
              </div>
              {outboundDependencies.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {outboundDependencies.map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => onSelectNode(target)}
                      className="text-left font-mono text-[11px] px-2.5 py-1.5 bg-neutral-950/80 hover:bg-neutral-800/80 border border-neutral-800 rounded transition-colors text-sky-300 hover:text-white flex items-center justify-between group cursor-pointer"
                    >
                      <span className="truncate">{target}</span>
                      <span className="text-[10px] text-neutral-600 group-hover:text-neutral-400">
                        &rarr;
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-2 text-[11px] text-neutral-500 italic bg-neutral-950/40 rounded border border-neutral-800/40">
                  No internal repository imports.
                </div>
              )}
            </div>

            {/* Dependents (Inbound) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">
                  Imported By ({inboundDependencies.length})
                </span>
                <span className="text-[10px] text-neutral-500">Inbound</span>
              </div>
              {inboundDependencies.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {inboundDependencies.map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => onSelectNode(source)}
                      className="text-left font-mono text-[11px] px-2.5 py-1.5 bg-neutral-950/80 hover:bg-neutral-800/80 border border-neutral-800 rounded transition-colors text-emerald-300 hover:text-white flex items-center justify-between group cursor-pointer"
                    >
                      <span className="truncate">{source}</span>
                      <span className="text-[10px] text-neutral-600 group-hover:text-neutral-400">
                        &larr;
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-2 text-[11px] text-neutral-500 italic bg-neutral-950/40 rounded border border-neutral-800/40">
                  Not imported by other repository files (entry point or leaf).
                </div>
              )}
            </div>

            {/* AST Defined Symbols */}
            <div className="space-y-2 pt-2 border-t border-neutral-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">
                  Defined Symbols ({node.symbols ? node.symbols.length : 0})
                </span>
                <span className="text-[10px] text-neutral-500">AST Extracted</span>
              </div>

              {node.symbols && node.symbols.length > 0 ? (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {node.symbols.map((sym, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-neutral-950/80 border border-neutral-800/80 rounded space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-neutral-200 font-semibold truncate">
                          {sym.name}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase bg-neutral-800 text-neutral-400 rounded">
                          {sym.type}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                        <span>Lines {sym.start_line} &ndash; {sym.end_line}</span>
                      </div>
                      {sym.docstring && (
                        <p className="text-[10px] text-neutral-400 italic line-clamp-2">
                          {sym.docstring}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-2 text-[11px] text-neutral-500 italic bg-neutral-950/40 rounded border border-neutral-800/40">
                  No top-level functions or classes extracted.
                </div>
              )}
            </div>
          </>
        ) : (
          /* Code Preview Tab */
          <div className="space-y-3">
            {codeLoading && (
              <div className="p-8 text-center space-y-2 animate-pulse">
                <div className="text-xs font-medium text-emerald-400">Loading file content...</div>
                <div className="text-[11px] text-neutral-500">Reading from local repository workspace</div>
              </div>
            )}

            {codeError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded text-red-200 text-xs">
                {codeError}
              </div>
            )}

            {codeData && !codeLoading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                  <span>{codeData.line_count} lines</span>
                  {codeData.is_truncated && (
                    <span className="text-amber-400 text-[10px]">Preview capped for speed</span>
                  )}
                </div>

                <div className="relative rounded-lg overflow-hidden border border-neutral-800 bg-[#08090b]">
                  <pre className="p-3 text-[11px] font-mono text-neutral-200 overflow-x-auto leading-relaxed max-h-[460px]">
                    <code>{codeData.content}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
