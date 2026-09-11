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
      setIssuesError(err.message || "Failed to seed sample issue.");
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
        const data = await fetchRepoIssues(owner, repo, selectedLabel, forceRefresh, "open");
        const openIssues = (data.issues || []).filter(
          (i) => !i.state || i.state.toLowerCase() === "open"
        );
        setIssues(openIssues);
        if (data.available_labels && data.available_labels.length > 0) {
          setAvailableLabels(data.available_labels);
        }
        // Auto-select first open issue if none selected or if selected issue is now closed
        if (openIssues.length > 0) {
          setSelectedIssue((prev) =>
            prev && openIssues.some((i) => i.number === prev.number)
              ? prev
              : openIssues[0]
          );
        } else {
          setSelectedIssue(null);
        }
      } catch (err: any) {
        setIssuesError(err.message || "Failed to load GitHub issues.");
      } finally {
        setLoadingIssues(false);
      }
    },
    [owner, repo, selectedLabel]
  );

  useEffect(() => {
    loadIssues();
  }, [selectedLabel, owner, repo]);

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

  // Client-side search filtering (strictly open issues only)
  const filteredIssues = useMemo(() => {
    const openOnly = issues.filter(
      (i) => !i.state || i.state.toLowerCase() === "open"
    );
    if (!searchQuery.trim()) return openOnly;
    const q = searchQuery.toLowerCase();
    return openOnly.filter(
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
    <div className="border border-neutral-800 bg-neutral-950 rounded p-4 space-y-4">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold font-mono text-neutral-300 uppercase tracking-wider">
              Issue Discovery &amp; Explanation
            </h3>
            <span className="px-2 py-0.5 text-[11px] font-mono bg-neutral-900 text-neutral-400 rounded border border-neutral-800">
              {filteredIssues.length} open
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Issue Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter issues..."
            className="px-2.5 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-xs font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 w-48"
          />

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadIssues(true)}
            disabled={loadingIssues}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded text-xs font-mono transition-colors cursor-pointer border border-neutral-800 disabled:opacity-50"
          >
            {loadingIssues ? "Syncing..." : "Sync GitHub"}
          </button>
        </div>
      </div>

      {/* Label Filter Strip */}
      {availableLabels.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
          <button
            type="button"
            onClick={() => setSelectedLabel("all")}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer shrink-0 border ${
              selectedLabel === "all"
                ? "bg-neutral-800 border-neutral-600 text-white font-bold"
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
              className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 border ${
                selectedLabel === lbl.name
                  ? "bg-neutral-800 border-neutral-600 text-white font-bold"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <span>{lbl.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Error Alert */}
      {issuesError && (
        <div className="p-2.5 bg-red-950/60 border border-red-800 text-xs font-mono text-red-300">
          {issuesError}
        </div>
      )}

      {/* Main Split-View: Issue List on Left | Deep Dive on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
        {/* Left Column: Issue List (5 cols) */}
        <div className="lg:col-span-5 space-y-2 max-h-[580px] overflow-y-auto pr-1">
          {loadingIssues && issues.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-neutral-500 border border-neutral-800 rounded bg-neutral-900/50">
              Fetching repository issues...
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="p-6 text-center border border-neutral-800 rounded bg-neutral-900/50 text-xs font-mono text-neutral-400 space-y-3">
              <p>No open issues found.</p>
              <button
                type="button"
                onClick={handleSeedDemoIssue}
                disabled={seeding}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs font-mono transition-colors cursor-pointer disabled:opacity-50 border border-neutral-700"
              >
                {seeding ? "Seeding..." : "Seed Sample Issue"}
              </button>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const isSelected = selectedIssue?.number === issue.number;
              return (
                <div
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  className={`p-3 rounded border transition-colors cursor-pointer text-xs space-y-1.5 ${
                    isSelected
                      ? "bg-neutral-900 border-neutral-600 text-white"
                      : "bg-neutral-950 border-neutral-800 text-neutral-300 hover:bg-neutral-900/50 hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-neutral-400 font-bold shrink-0">
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
                          className="px-1.5 py-0.2 text-[10px] rounded border border-neutral-800 text-neutral-400 font-mono"
                        >
                          {lbl.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 pt-1 border-t border-neutral-800">
                    <span>@{issue.author}</span>
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
        <div className="lg:col-span-7 bg-neutral-950 border border-neutral-800 rounded p-4 space-y-4">
          {!selectedIssue ? (
            <div className="h-48 flex items-center justify-center text-center text-xs font-mono text-neutral-500">
              Select an issue from the list to view its explanation and checklist.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected Issue Header */}
              <div className="space-y-2 border-b border-neutral-800 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-white font-bold text-sm">
                        #{selectedIssue.number}
                      </span>
                      <span className="px-2 py-0.2 text-[10px] font-mono font-semibold bg-neutral-900 text-neutral-300 border border-neutral-800 rounded">
                        OPEN
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-neutral-100 mt-1">
                      {selectedIssue.title}
                    </h4>
                  </div>

                  <a
                    href={selectedIssue.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-neutral-400 hover:text-white underline shrink-0"
                  >
                    GitHub &rarr;
                  </a>
                </div>

                {/* Toggle Original Issue Body */}
                {selectedIssue.body && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowOriginalBody((s) => !s)}
                      className="text-[11px] font-mono text-neutral-400 hover:text-neutral-200 underline cursor-pointer"
                    >
                      {showOriginalBody ? "Hide original issue body" : "View original issue body"}
                    </button>
                    {showOriginalBody && (
                      <div className="mt-2 p-3 bg-neutral-900 rounded border border-neutral-800 font-mono text-xs text-neutral-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {selectedIssue.body}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Explanation Content Area */}
              {explaining && (
                <div className="p-6 text-center text-xs font-mono text-neutral-400 border border-neutral-800 rounded bg-neutral-900">
                  Generating explanation from repository dependency graph...
                </div>
              )}

              {explanationError && (
                <div className="p-2.5 bg-red-950/60 border border-red-800 text-xs font-mono text-red-300">
                  {explanationError}
                </div>
              )}

              {explanation && !explaining && (
                <div className="space-y-4">
                  {/* Indicators */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-400">Complexity:</span>
                      <span className="font-semibold text-neutral-200 uppercase">
                        {explanation.estimated_complexity}
                      </span>
                    </div>

                    <span className="text-[11px] text-neutral-400">
                      {explanation.is_fallback ? "Fallback Engine" : `Model: ${explanation.model_used}`}
                    </span>
                  </div>

                  {/* 1. Plain-English Summary */}
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold font-mono text-neutral-400 uppercase tracking-wider">
                      Summary
                    </h5>
                    <p className="text-xs text-neutral-200 leading-relaxed bg-neutral-900 p-3 rounded border border-neutral-800 font-mono whitespace-pre-wrap">
                      {explanation.plain_english_summary}
                    </p>
                  </div>

                  {/* 2. Real-World Analogy */}
                  {explanation.real_world_analogy && (
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold font-mono text-neutral-400 uppercase tracking-wider">
                        Analogy
                      </h5>
                      <div className="p-3 bg-neutral-900 rounded border border-neutral-800 text-xs text-neutral-300 leading-relaxed font-mono whitespace-pre-wrap">
                        {explanation.real_world_analogy}
                      </div>
                    </div>
                  )}

                  {/* 3. Relevant 1-Hop Files */}
                  {explanation.relevant_files && explanation.relevant_files.length > 0 && (
                    <div className="space-y-1.5">
                      <h5 className="text-xs font-bold font-mono text-neutral-400 uppercase tracking-wider">
                        Relevant Files ({explanation.relevant_files.length})
                      </h5>

                      <div className="space-y-1">
                        {explanation.relevant_files.map((rf, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-neutral-900 rounded border border-neutral-800 flex items-start justify-between gap-2"
                          >
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => onSelectFile(rf.file)}
                                className="font-mono text-xs font-semibold text-neutral-200 hover:underline flex items-center gap-1 cursor-pointer truncate"
                              >
                                <span>{rf.file}</span>
                                <span className="text-neutral-500">&rarr;</span>
                              </button>
                              <p className="text-[11px] text-neutral-400">{rf.reason}</p>
                            </div>

                            {rf.symbols_to_inspect && rf.symbols_to_inspect.length > 0 && (
                              <div className="shrink-0 flex flex-wrap gap-1 max-w-[150px] justify-end font-mono text-[9px]">
                                {rf.symbols_to_inspect.slice(0, 2).map((s, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className="px-1 py-0.5 bg-neutral-950 text-neutral-400 rounded border border-neutral-800"
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

                  {/* 4. Implementation Steps */}
                  {explanation.implementation_steps && explanation.implementation_steps.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <h5 className="text-xs font-bold font-mono text-neutral-400 uppercase tracking-wider">
                        Checklist
                      </h5>
                      <div className="space-y-1">
                        {explanation.implementation_steps.map((step, sIdx) => (
                          <div
                            key={sIdx}
                            className="p-2 bg-neutral-900 rounded border border-neutral-800 text-xs flex items-start gap-2 text-neutral-300 font-mono"
                          >
                            <span className="text-neutral-500 font-bold shrink-0">
                              {sIdx + 1}.
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Agent Handoff Action Button */}
                  <div className="pt-2 border-t border-neutral-800 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (onPrepareAgentHandoff) {
                          onPrepareAgentHandoff(selectedIssue, explanation);
                        }
                      }}
                      className="px-4 py-2 bg-neutral-100 hover:bg-white text-neutral-900 font-semibold rounded text-xs cursor-pointer font-mono"
                    >
                      Handoff to Agent &rarr;
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
