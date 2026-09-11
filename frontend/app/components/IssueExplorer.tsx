"use client";

/**
 * IssueExplorer.tsx
 * Phase 5 Component: GitHub Issue Discovery & Grounded Explanation.
 * Fetches open issues, filters by label/search, translates technical bugs into
 * plain-English explanations with real-world analogies and implementation steps,
 * and links directly to relevant files in the Graph Explorer.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  IssueSummary,
  IssueLabel,
  IssueExplanation,
  fetchRepoIssues,
  explainIssue,
  seedDemoIssue,
} from "../lib/api";

interface IssueExplorerProps {
  owner: string;
  repo: string;
  onSelectFile: (filePath: string) => void;
  onPrepareAgentHandoff?: (issue: IssueSummary, explanation: IssueExplanation) => void;
}

export default function IssueExplorer({
  owner,
  repo,
  onSelectFile,
  onPrepareAgentHandoff,
}: IssueExplorerProps) {
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [availableLabels, setAvailableLabels] = useState<IssueLabel[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  const [selectedIssue, setSelectedIssue] = useState<IssueSummary | null>(null);
  const [explanation, setExplanation] = useState<IssueExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [showOriginalBody, setShowOriginalBody] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleSeedDemoIssue = async () => {
    setSeeding(true);
    try {
      const demo = await seedDemoIssue(owner, repo);
      setIssues((prev) => [demo, ...prev]);
      setSelectedIssue(demo);
    } catch (err: any) {
      setIssuesError(err.message || "Failed to seed demo issue.");
    } finally {
      setSeeding(false);
    }
  };

  // Load issues on mount or when repo changes
  const loadIssues = useCallback(
    async (forceRefresh = false) => {
      setLoadingIssues(true);
      setIssuesError(null);
      try {
        const data = await fetchRepoIssues(owner, repo, selectedLabel, forceRefresh);
        setIssues(data.issues);
        if (data.available_labels && data.available_labels.length > 0) {
          setAvailableLabels(data.available_labels);
        }
        // Auto-select first issue if none selected
        if (data.issues.length > 0 && !selectedIssue) {
          setSelectedIssue(data.issues[0]);
        }
      } catch (err: any) {
        setIssuesError(err.message || "Failed to load GitHub issues.");
      } finally {
        setLoadingIssues(false);
      }
    },
    [owner, repo, selectedLabel, selectedIssue]
  );

  useEffect(() => {
    loadIssues();
  }, [selectedLabel]);

  // When selected issue changes, fetch or generate its explanation on-demand
  useEffect(() => {
    if (!selectedIssue) {
      setExplanation(null);
      return;
    }

    let isMounted = true;
    setExplaining(true);
    setExplanationError(null);

    explainIssue(owner, repo, selectedIssue.number)
      .then((data) => {
        if (isMounted) {
          setExplanation(data);
          setExplaining(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setExplanationError(err.message || "Failed to generate issue explanation.");
          setExplaining(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [owner, repo, selectedIssue]);

  // Client-side search filtering
  const filteredIssues = useMemo(() => {
    if (!searchQuery.trim()) return issues;
    const q = searchQuery.toLowerCase();
    return issues.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.body && i.body.toLowerCase().includes(q)) ||
        i.number.toString().includes(q)
    );
  }, [issues, searchQuery]);

  const getComplexityBadge = (complexity: string) => {
    switch (complexity.toLowerCase()) {
      case "low":
        return "bg-emerald-950 text-emerald-300 border-emerald-800";
      case "high":
        return "bg-red-950 text-red-300 border-red-800";
      default:
        return "bg-amber-950 text-amber-300 border-amber-800";
    }
  };

  return (
    <div className="border border-neutral-800 bg-neutral-900/60 rounded-xl overflow-hidden shadow-xl space-y-4 p-5">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Issue Discovery &amp; Explanation
            </h3>
            <span className="px-2 py-0.5 text-xs bg-neutral-800 text-neutral-400 rounded-full border border-neutral-700">
              {filteredIssues.length} open
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Browse open GitHub issues, grounded in the repository dependency graph.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Issue Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter issues..."
            className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-48"
          />

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadIssues(true)}
            disabled={loadingIssues}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs transition-colors cursor-pointer border border-neutral-700 disabled:opacity-50"
            title="Fetch fresh issues from GitHub API"
          >
            {loadingIssues ? "Syncing..." : "Sync GitHub"}
          </button>
        </div>
      </div>

      {/* Label Pills Filter Strip */}
      {availableLabels.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setSelectedLabel("all")}
            className={`px-2.5 py-1 rounded-full text-[11px] transition-colors cursor-pointer shrink-0 border ${
              selectedLabel === "all"
                ? "bg-emerald-950 border-emerald-700 text-emerald-300 font-medium"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            All Labels
          </button>
          {availableLabels.map((lbl) => (
            <button
              key={lbl.name}
              type="button"
              onClick={() => setSelectedLabel(lbl.name)}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 border ${
                selectedLabel === lbl.name
                  ? "bg-neutral-800 border-neutral-600 text-white font-medium"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: `#${lbl.color}` }}
              ></span>
              <span>{lbl.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Error Alert */}
      {issuesError && (
        <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-xs text-red-200">
          <span className="font-semibold text-red-400">Issues Notice: </span>
          {issuesError}
        </div>
      )}

      {/* Main Split-View: Issue List on Left | Deep Dive on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
        {/* Left Column: Issue List (5 cols) */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
          {loadingIssues && issues.length === 0 ? (
            <div className="p-8 text-center space-y-2 border border-neutral-800 rounded-xl bg-neutral-950/40 animate-pulse">
              <div className="text-xs font-medium text-sky-400">Fetching repository issues...</div>
              <div className="text-[11px] text-neutral-500">Connecting to GitHub API</div>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="p-8 text-center border border-neutral-800 rounded-xl bg-neutral-950/40 text-xs text-neutral-400 space-y-3">
              <p>No open issues found for this repository filter.</p>
              <button
                type="button"
                onClick={handleSeedDemoIssue}
                disabled={seeding}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 shadow-md shadow-emerald-950"
              >
                <span>🧪</span>
                <span>{seeding ? "Seeding..." : "Seed Sample Issue for Demo"}</span>
              </button>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const isSelected = selectedIssue?.number === issue.number;
              return (
                <div
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer text-xs space-y-2 ${
                    isSelected
                      ? "bg-neutral-900/95 border-emerald-600/70 shadow-lg shadow-emerald-950/30"
                      : "bg-neutral-950/60 border-neutral-800/80 hover:bg-neutral-900/50 hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-emerald-400 font-semibold shrink-0">
                      #{issue.number}
                    </span>
                    <span className="font-medium text-neutral-200 line-clamp-2 flex-1">
                      {issue.title}
                    </span>
                  </div>

                  {/* Labels Strip */}
                  {issue.labels && issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {issue.labels.map((lbl, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-[10px] rounded-full border border-neutral-800 text-neutral-300 font-mono"
                          style={{
                            backgroundColor: `#${lbl.color}15`,
                            borderColor: `#${lbl.color}40`,
                          }}
                        >
                          {lbl.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1 border-t border-neutral-800/60">
                    <span>by @{issue.author}</span>
                    {issue.comments_count > 0 && (
                      <span>{issue.comments_count} comments</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Deep Dive & Grounded Explanation (7 cols) */}
        <div className="lg:col-span-7 bg-neutral-950/70 border border-neutral-800 rounded-xl p-5 space-y-4">
          {!selectedIssue ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-neutral-500 space-y-2">
              <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>Select an issue from the list to see its plain-English explanation and implementation checklist.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected Issue Header */}
              <div className="space-y-2 border-b border-neutral-800 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-400 font-bold text-sm">
                        #{selectedIssue.number}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-full">
                        OPEN
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-white mt-1">
                      {selectedIssue.title}
                    </h4>
                  </div>

                  <a
                    href={selectedIssue.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-neutral-400 hover:text-white underline underline-offset-2 shrink-0 flex items-center gap-1"
                  >
                    <span>GitHub</span>
                    <span>&rarr;</span>
                  </a>
                </div>

                {/* Toggle Original Issue Body */}
                {selectedIssue.body && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowOriginalBody((s) => !s)}
                      className="text-[11px] text-neutral-400 hover:text-neutral-200 underline cursor-pointer"
                    >
                      {showOriginalBody ? "Hide original issue description" : "View original issue description"}
                    </button>
                    {showOriginalBody && (
                      <div className="mt-2 p-3 bg-neutral-900 rounded-lg border border-neutral-800 font-mono text-xs text-neutral-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {selectedIssue.body}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Explanation Content Area */}
              {explaining && (
                <div className="p-8 text-center space-y-2 border border-neutral-800/80 rounded-xl bg-neutral-900/30 animate-pulse">
                  <div className="text-xs font-semibold text-emerald-400">
                    Synthesizing grounded explanation...
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Extracting 1-hop AST graph neighborhood and translating task into plain English.
                  </div>
                </div>
              )}

              {explanationError && (
                <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-200">
                  {explanationError}
                </div>
              )}

              {explanation && !explaining && (
                <div className="space-y-4">
                  {/* Explanation Header Indicators */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-neutral-400">Estimated Complexity:</span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full border ${getComplexityBadge(
                          explanation.estimated_complexity
                        )}`}
                      >
                        {explanation.estimated_complexity}
                      </span>
                    </div>

                    {explanation.is_fallback ? (
                      <span className="px-2 py-0.5 text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800/70 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        Grounded Fallback Engine
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/70 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Model: {explanation.model_used}
                      </span>
                    )}
                  </div>

                  {/* 1. Plain-English Summary */}
                  <div className="space-y-1.5">
                    <h5 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                      Plain-English Summary
                    </h5>
                    <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed bg-neutral-900/60 p-3.5 rounded-lg border border-neutral-800">
                      {explanation.plain_english_summary}
                    </p>
                  </div>

                  {/* 2. Real-World Analogy */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400 text-sm">💡</span>
                      <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                        Intuitive Analogy
                      </h5>
                    </div>
                    <div className="p-3.5 bg-amber-950/20 border border-amber-800/50 rounded-lg text-xs sm:text-sm text-amber-200/90 leading-relaxed">
                      {explanation.real_world_analogy}
                    </div>
                  </div>

                  {/* 3. Relevant 1-Hop Files (Clickable to jump to Graph Explorer) */}
                  {explanation.relevant_files && explanation.relevant_files.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                          Affected Files ({explanation.relevant_files.length})
                        </h5>
                        <span className="text-[10px] text-neutral-500">
                          Click file to focus in Graph Explorer &uarr;
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {explanation.relevant_files.map((rf, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-neutral-900/80 rounded-lg border border-neutral-800 flex items-start justify-between gap-3 group"
                          >
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => onSelectFile(rf.file)}
                                className="font-mono text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer truncate"
                                title={`Focus ${rf.file} in Graph Explorer`}
                              >
                                <span className="truncate">{rf.file}</span>
                                <span className="text-neutral-500 group-hover:text-emerald-300">&rarr;</span>
                              </button>
                              <p className="text-[11px] text-neutral-400">{rf.reason}</p>
                            </div>

                            {rf.symbols_to_inspect && rf.symbols_to_inspect.length > 0 && (
                              <div className="shrink-0 flex flex-wrap gap-1 max-w-[150px] justify-end">
                                {rf.symbols_to_inspect.slice(0, 2).map((s, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className="px-1.5 py-0.5 text-[9px] font-mono bg-neutral-800 text-neutral-300 rounded border border-neutral-700"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. Actionable Implementation Steps */}
                  {explanation.implementation_steps && explanation.implementation_steps.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <h5 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                        Implementation Checklist
                      </h5>
                      <div className="space-y-1.5">
                        {explanation.implementation_steps.map((step, sIdx) => (
                          <div
                            key={sIdx}
                            className="p-2.5 bg-neutral-900/50 rounded-lg border border-neutral-800 text-xs flex items-start gap-2.5 text-neutral-300"
                          >
                            <span className="w-4 h-4 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center text-[10px] font-mono font-bold shrink-0 mt-0.5">
                              {sIdx + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Phase 6 Preparation Action Button */}
                  <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                    <div className="text-[11px] text-neutral-500">
                      Ready for automated coding?
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (onPrepareAgentHandoff) {
                          onPrepareAgentHandoff(selectedIssue, explanation);
                        } else {
                          alert(`Agent handoff prepared for Issue #${selectedIssue.number}! (Phase 6)`);
                        }
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-950"
                    >
                      <span>🚀 Prepare Agent Handoff</span>
                      <span>&rarr;</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
