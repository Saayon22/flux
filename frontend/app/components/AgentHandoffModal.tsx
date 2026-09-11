"use client";

import React, { useState, useEffect } from "react";
import {
  IssueSummary,
  IssueExplanation,
  AgentHandoffResponse,
  triggerAgentHandoff,
  publishPullRequest,
  rollbackHandoff,
  chatWithAgent,
  getHandoffResult,
} from "../lib/api";

interface AgentHandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  issue: IssueSummary;
  explanation?: IssueExplanation | null;
}

type HandoffStep = "opt_in" | "fork" | "synthesizing" | "routing" | "completed" | "error";

export default function AgentHandoffModal({
  isOpen,
  onClose,
  owner,
  repo,
  issue,
  explanation,
}: AgentHandoffModalProps) {
  const [step, setStep] = useState<HandoffStep>("opt_in");
  const [optInConfirmed, setOptInConfirmed] = useState(true);
  const [userNotes, setUserNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [publishingPR, setPublishingPR] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentHandoffResponse | null>(null);
  const [copiedDiff, setCopiedDiff] = useState(false);

  // Chat tab state
  const [activeTab, setActiveTab] = useState<"resolution" | "chat">("resolution");
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "agent"; text: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep("opt_in");
      setLoading(false);
      setError(null);
      setResult(null);
      setCopiedDiff(false);
      setActiveTab("resolution");
      setChatHistory([
        {
          role: "agent",
          text: `Hello! I am the flux Google ADK Agent. I am ready to resolve Issue #${issue.number} ("${issue.title}"). Confirm opt-in to begin autonomous resolution.`,
        },
      ]);

      // Check if an autonomous handoff (PR or Plan Artifact) was already generated and persisted in SQLite
      getHandoffResult(owner, repo, issue.number).then((cached) => {
        if (cached) {
          setResult(cached);
          setStep("completed");
          if (cached.decision === "pr" && cached.pr) {
            setChatHistory((prev) => [
              ...prev,
              {
                role: "agent",
                text: `Retrieved persisted Pull Request from SQLite: ${cached.pr?.pr_url} (#${cached.pr?.pr_number}).`,
              },
            ]);
          } else if (cached.plan) {
            setChatHistory((prev) => [
              ...prev,
              {
                role: "agent",
                text: `Retrieved persisted Implementation Plan Artifact from SQLite: "${cached.plan?.title}".`,
              },
            ]);
          }
        }
      });
    }
  }, [isOpen, issue, owner, repo]);

  if (!isOpen) return null;

  const handleExecuteHandoff = async () => {
    if (!optInConfirmed) {
      setError("Please confirm user opt-in before executing autonomous handoff.");
      return;
    }

    setLoading(true);
    setError(null);
    setStep("fork");

    try {
      // Simulate step-by-step progress visually while calling the backend endpoint
      const stepTimer1 = setTimeout(() => setStep("synthesizing"), 1200);
      const stepTimer2 = setTimeout(() => setStep("routing"), 2800);

      const res = await triggerAgentHandoff(owner, repo, issue.number, true, userNotes);

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      setResult(res);
      setStep("completed");
      setLoading(false);

      if (res.decision === "pr" && res.pr) {
        setChatHistory((prev) => [
          ...prev,
          {
            role: "agent",
            text: `Pull Request successfully opened at ${res.pr?.pr_url}! Diff size: ${res.diff_stats?.line_count} lines across ${res.diff_stats?.files_touched.length} file(s).`,
          },
        ]);
      } else if (res.plan) {
        setChatHistory((prev) => [
          ...prev,
          {
            role: "agent",
            text: res.diff_stats?.pre_routed
              ? `High-complexity architectural issue detected upfront. Generated structured Implementation Plan Artifact: "${res.plan?.title}". Speculative code modifications safely bypassed.`
              : `Fix complexity exceeded single PR threshold. Generated structured Implementation Plan Artifact: "${res.plan?.title}".`,
          },
        ]);
      }
    } catch (err: any) {
      setError(err.message || "Autonomous agent handoff execution failed.");
      setStep("error");
      setLoading(false);
    }
  };

  const handleConfirmPublishPR = async () => {
    if (!result?.diff) return;
    setPublishingPR(true);
    setError(null);
    try {
      const res = await publishPullRequest(owner, repo, issue.number, {
        diff: result.diff,
        fork_ref: result.fork?.fork_ref,
      });
      setResult((prev) =>
        prev
          ? {
              ...prev,
              pr: res.pr,
              message: res.message,
            }
          : null
      );
      setChatHistory((prev) => [
        ...prev,
        {
          role: "agent",
          text: `Pull Request successfully opened on GitHub: ${res.pr?.pr_url} (#${res.pr?.pr_number})!`,
        },
      ]);
    } catch (err: any) {
      setError(err.message || "Failed to publish Pull Request to GitHub.");
    } finally {
      setPublishingPR(false);
    }
  };

  const handleDiscardRollback = async () => {
    setRollingBack(true);
    setError(null);
    try {
      await rollbackHandoff(owner, repo, issue.number);
      setChatHistory((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Workspace modifications were discarded and the temporary fix branch was reset.",
        },
      ]);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to rollback workspace modifications.");
    } finally {
      setRollingBack(false);
    }
  };

  const handleResetAndRerun = async () => {
    setRollingBack(true);
    setError(null);
    try {
      await rollbackHandoff(owner, repo, issue.number);
    } catch {}
    setResult(null);
    setStep("opt_in");
    setRollingBack(false);
    setChatHistory((prev) => [
      ...prev,
      {
        role: "agent",
        text: "Cached handoff result was cleared. You can now re-run autonomous resolution.",
      },
    ]);
  };

  const handleCopyDiff = () => {
    if (result?.diff) {
      navigator.clipboard.writeText(result.diff);
      setCopiedDiff(true);
      setTimeout(() => setCopiedDiff(false), 2500);
    }
  };

  const handleDownloadPlan = () => {
    if (!result?.plan) return;
    const md =
      result.plan.markdown_content ||
      `# ${result.plan.title}\n\n${result.plan.summary}\n\n## Refactoring Roadmap\n${result.plan.steps
        .map((s, idx) => `- [ ] Step ${idx + 1}: ${s}`)
        .join("\n")}\n\n## Risk Rating\n${result.plan.estimated_risk}`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flux-plan-issue-${issue.number}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || chatLoading) return;

    const userText = chatMessage.trim();
    setChatMessage("");
    setChatHistory((prev) => [...prev, { role: "user", text: userText }]);
    setChatLoading(true);

    try {
      const res = await chatWithAgent(
        `Context: Repository ${owner}/${repo}, Issue #${issue.number}: "${issue.title}". User query: ${userText}`
      );
      setChatHistory((prev) => [...prev, { role: "agent", text: res.response }]);
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${err.message || "Agent response failed"}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="relative w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-black">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold font-mono text-white">
                Agent Handoff
              </h3>
              <span className="text-xs font-mono text-neutral-400">
                (Issue #{issue.number}: {issue.title})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex bg-neutral-900 border border-neutral-800 rounded text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveTab("resolution")}
                className={`px-2.5 py-1 rounded cursor-pointer ${
                  activeTab === "resolution" ? "bg-neutral-800 text-white font-bold" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Handoff Flow
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("chat")}
                className={`px-2.5 py-1 rounded cursor-pointer ${
                  activeTab === "chat" ? "bg-neutral-800 text-white font-bold" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Agent Chat
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 text-neutral-400 hover:text-white text-xs font-mono cursor-pointer"
            >
              [Close]
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === "chat" ? (
            /* Agent Chat Tab */
            <div className="flex flex-col h-[460px]">
              <div className="flex-1 overflow-y-auto space-y-2 p-3 bg-neutral-900 rounded border border-neutral-800 font-mono text-xs">
                {chatHistory.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      m.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <span className="text-[10px] text-neutral-500 mb-0.5">
                      {m.role === "user" ? "You" : "Agent"}
                    </span>
                    <div
                      className={`max-w-[85%] rounded p-2.5 whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-neutral-800 text-white border border-neutral-700"
                          : "bg-black border border-neutral-800 text-neutral-300"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="text-neutral-500 text-xs font-mono">
                    Agent is responding...
                  </div>
                )}
              </div>

              <form onSubmit={handleSendChatMessage} className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Ask a question about this issue or patch..."
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatMessage.trim()}
                  className="px-4 py-2 bg-neutral-200 hover:bg-white disabled:opacity-50 text-neutral-900 text-xs font-mono font-semibold rounded cursor-pointer"
                >
                  Send
                </button>
              </form>
            </div>
          ) : (
            /* Main Handoff Flow Tab */
            <>
              {/* Step 1: Opt-In Confirmation Card */}
              {step === "opt_in" && (
                <div className="space-y-3 bg-neutral-900 p-4 rounded border border-neutral-800 font-mono text-xs">
                  <div>
                    <h4 className="font-bold text-neutral-200">
                      Human-in-the-Loop Confirmation Gate
                    </h4>
                    <p className="text-neutral-400 mt-1">
                      Authorize the agent to provision a fork (lazy forking) and generate code modifications for Issue #{issue.number}.
                    </p>
                  </div>

                  {explanation && explanation.relevant_files && explanation.relevant_files.length > 0 && (
                    <div className="p-2.5 bg-black rounded border border-neutral-800 space-y-1">
                      <span className="text-[11px] text-neutral-500 font-bold">
                        Target Files:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {explanation.relevant_files.map((rf, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 text-[11px] bg-neutral-900 text-neutral-300 rounded border border-neutral-800"
                          >
                            {rf.file}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-neutral-400">
                      Optional Developer Instructions:
                    </label>
                    <input
                      type="text"
                      value={userNotes}
                      onChange={(e) => setUserNotes(e.target.value)}
                      placeholder="e.g. Ensure backwards compatibility with existing schemas"
                      className="w-full bg-black border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="optInCheck"
                      checked={optInConfirmed}
                      onChange={(e) => setOptInConfirmed(e.target.checked)}
                      className="rounded border-neutral-700 cursor-pointer"
                    />
                    <label htmlFor="optInCheck" className="text-neutral-300 cursor-pointer">
                      I confirm opt-in for automated agent handoff.
                    </label>
                  </div>

                  {error && (
                    <div className="p-2.5 bg-red-950/60 border border-red-800 text-red-300 text-xs">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3 py-1.5 text-neutral-400 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteHandoff}
                      disabled={!optInConfirmed}
                      className="px-4 py-1.5 bg-neutral-100 hover:bg-white disabled:opacity-50 text-neutral-900 font-semibold rounded cursor-pointer"
                    >
                      Execute Handoff &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Progress State */}
              {(step === "fork" || step === "synthesizing" || step === "routing") && (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-center font-mono">
                  <div className="text-sm font-bold text-neutral-200">
                    {step === "fork" && "Provisioning fork..."}
                    {step === "synthesizing" && "Synthesizing code patch..."}
                    {step === "routing" && "Evaluating diff complexity..."}
                  </div>
                  <p className="text-xs text-neutral-500">
                    Agent is processing Issue #{issue.number}.
                  </p>
                </div>
              )}

              {/* Resolution Completed View */}
              {step === "completed" && result && (
                <div className="space-y-4 font-mono text-xs">
                  {/* Status Banner */}
                  <div className="p-3 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-neutral-900 border-neutral-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-200">
                          {result.decision === "pr"
                            ? result.pr
                              ? "Decision: Contained Fix (PR Published)"
                              : "Decision: Contained Fix (Diff Ready for Review)"
                            : "Decision: High Complexity (Implementation Plan)"}
                        </span>
                        <span className="text-neutral-500">
                          ({result.diff_stats?.line_count || 0} lines changed, {result.diff_stats?.files_touched.length || 1} file(s))
                        </span>
                      </div>
                      <p className="text-neutral-400 text-[11px] mt-0.5">{result.message}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleResetAndRerun}
                        disabled={loading || publishingPR || rollingBack}
                        className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700 cursor-pointer disabled:opacity-50"
                      >
                        Re-run
                      </button>

                      {result.decision === "pr" && result.pr && (
                        <a
                          href={result.pr.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-neutral-100 hover:bg-white text-neutral-900 font-bold rounded"
                        >
                          View PR #{result.pr.pr_number} &rarr;
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Plan Artifact Display (if High Complexity) */}
                  {result.plan && (
                    <div className="p-4 bg-neutral-900 border border-neutral-800 rounded space-y-3">
                      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                        <div>
                          <h5 className="font-bold text-neutral-200">
                            {result.plan.title}
                          </h5>
                          <span className="text-[11px] text-neutral-400">
                            Risk: {result.plan.estimated_risk}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={handleDownloadPlan}
                          className="px-3 py-1 bg-neutral-200 hover:bg-white text-neutral-900 font-bold rounded cursor-pointer"
                        >
                          Download Plan (.md)
                        </button>
                      </div>

                      <div className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
                        {result.plan.summary}
                      </div>

                      {result.plan.affected_modules && result.plan.affected_modules.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-neutral-500 font-bold text-[11px]">
                            Affected Modules:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {result.plan.affected_modules.map((mod, mIdx) => (
                              <span
                                key={mIdx}
                                className="px-1.5 py-0.5 bg-black text-neutral-300 rounded border border-neutral-800"
                              >
                                {mod}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <span className="text-neutral-500 font-bold text-[11px]">
                          Steps:
                        </span>
                        <div className="space-y-1">
                          {result.plan.steps.map((st, sIdx) => (
                            <div key={sIdx} className="text-neutral-300 flex items-start gap-2">
                              <span className="text-neutral-500 font-bold shrink-0">{sIdx + 1}.</span>
                              <span>{st}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {result.plan.quality_assurance && result.plan.quality_assurance.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-neutral-500 font-bold text-[11px]">
                            Quality Assurance:
                          </span>
                          <div className="space-y-0.5">
                            {result.plan.quality_assurance.map((qa, qIdx) => (
                              <div key={qIdx} className="text-neutral-400 flex items-center gap-1.5">
                                <span>-</span>
                                <span>{qa}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Unified Diff Viewer */}
                  {result.decision === "pr" && result.diff && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-neutral-400">
                          Unified Diff Output
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyDiff}
                          className="px-2.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer border border-neutral-700"
                        >
                          {copiedDiff ? "Copied" : "Copy Diff"}
                        </button>
                      </div>

                      <div className="bg-black rounded border border-neutral-800 p-3 font-mono text-xs overflow-x-auto max-h-72">
                        {result.diff.split("\n").map((line: string, lIdx: number) => {
                          const isAdd = line.startsWith("+") && !line.startsWith("+++");
                          const isDel = line.startsWith("-") && !line.startsWith("---");
                          const isHeader = line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++");
                          return (
                            <div
                              key={lIdx}
                              className={`leading-relaxed whitespace-pre ${
                                isAdd
                                  ? "text-emerald-400"
                                  : isDel
                                  ? "text-red-400"
                                  : isHeader
                                  ? "text-sky-400 font-bold"
                                  : "text-neutral-400"
                              }`}
                            >
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions Footer */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-2 border-t border-neutral-800 text-xs gap-2">
                    <div className="text-neutral-500 truncate">
                      Fork ref: {result.fork?.fork_ref || "None"}
                    </div>

                    {result.decision === "pr" && !result.pr ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleDiscardRollback}
                          disabled={rollingBack || publishingPR}
                          className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-red-400 rounded cursor-pointer disabled:opacity-50"
                        >
                          {rollingBack ? "Rolling back..." : "Discard & Rollback"}
                        </button>

                        <button
                          type="button"
                          onClick={handleConfirmPublishPR}
                          disabled={publishingPR || rollingBack}
                          className="px-4 py-1.5 bg-neutral-100 hover:bg-white text-neutral-900 font-bold rounded cursor-pointer disabled:opacity-50"
                        >
                          {publishingPR ? "Publishing PR..." : "Confirm & Publish PR"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded cursor-pointer"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Error State */}
              {step === "error" && (
                <div className="p-4 bg-red-950/60 border border-red-800 rounded space-y-2 text-xs font-mono">
                  <h4 className="font-bold text-red-300">Agent Handoff Error</h4>
                  <p className="text-neutral-300">{error}</p>
                  <button
                    type="button"
                    onClick={() => setStep("opt_in")}
                    className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
