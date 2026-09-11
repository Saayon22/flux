"use client";
// GitHub issue discovery and grounded architecture resolution component.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  IssueSummary,
  IssueLabel,
  IssueExplanation,
  fetchRepoIssues,
  explainIssue,
  seedDemoIssue,
} from "../lib/api";
import {
  CircleDot,
  Search,
  RefreshCw,
  ExternalLink,
  FileCode,
  ArrowRight,
  CloudCog,
  Bot,
} from "lucide-react";

interface IssueExplorerProps {
  owner: string;
  repo: string;
  onSelectFile: (filePath: string) => void;
  onPrepareAgentHandoff?: (issue: IssueSummary, explanation: IssueExplanation) => void;
}

// Extracts error message string safely from unknown error.
const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

// Renders split-view issue browser with grounded Gemini blueprints.
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

  // Injects sample benchmark issue into repository database for demonstration.
  const handleSeedDemoIssue = async () => {
    setSeeding(true);
    try {
      const demo = await seedDemoIssue(owner, repo);
      setIssues((prev) => [demo, ...prev]);
      setSelectedIssue(demo);
    } catch (err: unknown) {
      setIssuesError(getErrorMessage(err, "Failed to seed sample issue."));
    } finally {
      setSeeding(false);
    }
  };

  // Loads repository issues from backend API with optional label filtering and caching.
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
        if (openIssues.length > 0) {
          setSelectedIssue((prev) =>
            prev && openIssues.some((i) => i.number === prev.number)
              ? prev
              : openIssues[0]
          );
        } else {
          setSelectedIssue(null);
        }
      } catch (err: unknown) {
        setIssuesError(getErrorMessage(err, "Failed to load GitHub issues."));
      } finally {
        setLoadingIssues(false);
      }
    },
    [owner, repo, selectedLabel]
  );

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  useEffect(() => {
    if (!selectedIssue) return;

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
      .catch((err: unknown) => {
        if (isMounted) {
          setExplanationError(
            getErrorMessage(err, "Failed to generate grounded issue explanation.")
          );
          setExplaining(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [owner, repo, selectedIssue]);

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

  return (
    <div className="issue-explorer akaru-card p-6 sm:p-8 space-y-6 shadow-2xl">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(23,24,23,0.1)] pb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#df7d4c] text-[#fffdf8] flex items-center justify-center font-bold shadow-md shadow-[#df7d4c]/20">
            <CircleDot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#171817] tracking-tight">
              Issue Discovery &amp; Grounded Resolution
            </h3>
            <p className="text-xs text-[#77756f] mt-0.5">
              Inspect grounded problem breakdowns and launch verified autonomous agent fixes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Issue Filter Input */}
          <div className="flex items-center gap-2 px-3.5 py-2 bg-[#f4efe6] border border-[rgba(23,24,23,0.14)] rounded-xl focus-within:border-[#df7d4c] transition-all">
            <Search className="w-4 h-4 text-[#df7d4c]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search issues..."
              aria-label="Search issues by title or description"
              className="bg-transparent text-xs text-[#171817] placeholder-[rgba(23,24,23,0.45)] focus:outline-none w-44 font-code"
            />
          </div>

          {/* Sync Button */}
          <button
            type="button"
            onClick={() => loadIssues(true)}
            disabled={loadingIssues}
            aria-label="Sync issues from repository"
            className="btn-white px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingIssues ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Label Filter Strip */}
      {availableLabels.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setSelectedLabel("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
              selectedLabel === "all"
                ? "bg-[#df7d4c] text-[#fffdf8] border-[#df7d4c]"
                : "bg-[#fffefa] text-[#171817] border-[rgba(23,24,23,0.14)] hover:border-[#df7d4c]"
            }`}
          >
            All Labels ({issues.length})
          </button>
          {availableLabels.map((lbl) => (
            <button
              key={lbl.name}
              type="button"
              onClick={() => setSelectedLabel(lbl.name)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                selectedLabel === lbl.name
                  ? "bg-[#df7d4c] text-[#fffdf8] border-[#df7d4c]"
                  : "bg-[#fffefa] text-[#171817] border-[rgba(23,24,23,0.14)] hover:border-[#df7d4c]"
              }`}
            >
              <span>{lbl.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Error Alert */}
      {issuesError && (
        <div className="p-4 alert-terracotta-error rounded-2xl text-xs font-code">
          {issuesError}
        </div>
      )}

      {/* Main Split-View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-1">
        {/* Left Column: Issue List */}
        <div className="lg:col-span-5 space-y-3 max-h-[580px] overflow-y-auto pr-1">
          {loadingIssues && issues.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#77756f] akaru-card-sm">
              <div className="w-5 h-5 border-2 border-[#df7d4c] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              Fetching repository issues from GitHub...
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="p-10 text-center akaru-card-sm text-xs text-[#77756f] space-y-3">
              <p>No open issues found matching your query.</p>
              <button
                type="button"
                onClick={handleSeedDemoIssue}
                disabled={seeding}
                className="btn-terracotta px-4 py-2 text-xs cursor-pointer"
              >
                {seeding ? "Seeding..." : "Seed Benchmark Issue"}
              </button>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const isSelected = selectedIssue?.number === issue.number;
              return (
                <div
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  className={`issue-list-card p-4 rounded-2xl border transition-all cursor-pointer text-xs space-y-2 ${
                    isSelected
                      ? "issue-list-card-selected bg-[#fffdf8] border-[#df7d4c] shadow-md shadow-[#df7d4c]/10"
                      : "bg-[#fffefa] border-[rgba(23,24,23,0.12)] text-[#171817] hover:bg-[#fffdf8] hover:border-[#df7d4c] shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between font-code text-[11px]">
                    <span className="text-[#df7d4c] font-bold">#{issue.number}</span>
                    <span className="text-[#77756f] font-sans text-[11px]">
                      {issue.comments_count || 0} comments
                    </span>
                  </div>
                  <h4 className="font-bold text-[#171817] text-sm line-clamp-2 leading-snug">
                    {issue.title}
                  </h4>
                  {issue.labels && issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {issue.labels.slice(0, 3).map((lbl, lIdx) => (
                        <span
                          key={lIdx}
                          className="px-2 py-0.5 bg-[rgba(23,24,23,0.05)] text-[#171817] text-[10px] font-code rounded-md border border-[rgba(23,24,23,0.1)] font-medium"
                        >
                          {lbl.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Grounded AI Explanation */}
        <div className="issue-detail lg:col-span-7 bg-[#fffefa] border border-[rgba(23,24,23,0.12)] rounded-2xl p-6 space-y-5 max-h-[580px] overflow-y-auto text-[#171817] shadow-sm">
          {!selectedIssue ? (
            <div className="p-16 text-center text-xs text-[#77756f]">
              Select an issue from the list to inspect grounded explanations and fix blueprints.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Header */}
              <div className="border-b border-[rgba(23,24,23,0.1)] pb-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-[#df7d4c] text-[#fffdf8] font-code text-[11px] font-extrabold rounded-md">
                        #{selectedIssue.number}
                      </span>
                      <span className="text-xs text-[#77756f]">
                        opened by <strong className="text-[#171817]">{selectedIssue.author || "user"}</strong>
                      </span>
                    </div>
                    <h3 className="text-lg font-extrabold text-[#171817] leading-tight">
                      {selectedIssue.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <a
                      href={selectedIssue.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2.5 bg-[#fffefa] text-[#171817] border border-[rgba(23,24,23,0.14)] rounded-xl font-bold hover:bg-[rgba(23,24,23,0.05)] transition-all cursor-pointer shadow-xs"
                      title="View on GitHub"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    {onPrepareAgentHandoff && explanation && (
                      <button
                        type="button"
                        onClick={() => onPrepareAgentHandoff(selectedIssue, explanation)}
                        className="btn-terracotta px-4 py-2.5 text-xs flex items-center gap-2 cursor-pointer shadow-md"
                      >
                        <Bot className="w-4 h-4" />
                        <span>Solve with Agent</span>
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowOriginalBody(!showOriginalBody)}
                  className="text-xs text-[#df7d4c] hover:underline cursor-pointer inline-block font-semibold"
                >
                  {showOriginalBody ? "Hide Original Description" : "View Original GitHub Description"}
                </button>

                {showOriginalBody && (
                  <div className="p-4 bg-[#f4efe6] rounded-2xl border border-[rgba(23,24,23,0.12)] text-xs font-code text-[#171817] whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                    {selectedIssue.body || "No description provided."}
                  </div>
                )}
              </div>

              {/* Grounded Breakdown */}
              {explaining && (
                <div className="p-12 text-center text-xs text-[#171817] space-y-3">
                  <div className="w-6 h-6 border-2 border-[#df7d4c] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p>Synthesizing grounded explanation via Gemini...</p>
                </div>
              )}

              {explanationError && (
                <div className="p-4 alert-terracotta-error rounded-2xl text-xs font-code">
                  {explanationError}
                </div>
              )}

              {explanation && !explaining && (
                <div className="space-y-5 text-xs">
                  {/* Summary */}
                  <div className="space-y-2 bg-[rgba(223,125,76,0.06)] p-5 rounded-2xl border border-[rgba(223,125,76,0.22)]">
                    <div className="text-xs font-bold text-[#df7d4c] uppercase tracking-wider flex items-center gap-2">
                      <CloudCog className="w-4 h-4 text-[#df7d4c]" strokeWidth={2.25} />
                      Executive Summary
                    </div>
                    <p className="text-[#171817] leading-relaxed text-xs">
                      {explanation.plain_english_summary}
                    </p>
                  </div>

                  {/* Impacted Files */}
                  {explanation.relevant_files && explanation.relevant_files.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-[#171817] uppercase tracking-wider flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-[#df7d4c]" />
                        Impacted Source Files
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {explanation.relevant_files.map((item, fIdx) => (
                          <button
                            key={fIdx}
                            type="button"
                            onClick={() => onSelectFile(item.file)}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#fffefa] hover:bg-[rgba(223,125,76,0.06)] text-[#171817] hover:text-[#df7d4c] rounded-xl border border-[rgba(23,24,23,0.12)] hover:border-[#df7d4c] text-xs font-code transition-all cursor-pointer shadow-xs"
                          >
                            <span>{item.file}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#df7d4c]" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Implementation Steps */}
                  {explanation.implementation_steps && explanation.implementation_steps.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-[#171817] uppercase tracking-wider">
                        Resolution Steps Blueprint
                      </div>
                      <div className="space-y-2">
                        {explanation.implementation_steps.map((stepText, sIdx) => (
                          <div
                            key={sIdx}
                            className="p-3.5 bg-[rgba(23,24,23,0.03)] rounded-xl border border-[rgba(23,24,23,0.08)] text-[#171817] text-xs flex items-start gap-3"
                          >
                            <span className="text-[#df7d4c] font-code font-extrabold text-xs shrink-0 mt-0.5">
                              0{sIdx + 1}.
                            </span>
                            <span className="leading-relaxed text-[#171817]">{stepText}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
