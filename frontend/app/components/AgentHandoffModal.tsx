"use client";

import React, { useState, useEffect } from "react";
import {
  IssueSummary,
  IssueExplanation,
  AgentHandoffResponse,
  triggerAgentHandoff,
  chatWithAgent,
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
    }
  }, [isOpen, issue]);

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
            text: `Fix complexity exceeded single PR threshold. Generated structured Implementation Plan Artifact: "${res.plan?.title}".`,
          },
        ]);
      }
    } catch (err: any) {
      setError(err.message || "Autonomous agent handoff execution failed.");
      setStep("error");
      setLoading(false);
    }
  };

  const handleCopyDiff = () => {
    if (result?.diff) {
      navigator.clipboard.writeText(result.diff);
      setCopiedDiff(true);
      setTimeout(() => setCopiedDiff(false), 2500);
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Google ADK Autonomous Agent Handoff
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Gemini 3.6
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Resolving Issue #{issue.number}: <span className="text-neutral-200">{issue.title}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex bg-neutral-800/80 p-0.5 rounded-lg border border-neutral-700/60 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("resolution")}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === "resolution"
                    ? "bg-neutral-900 text-white font-medium shadow"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Handoff Flow
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("chat")}
                className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                  activeTab === "chat"
                    ? "bg-neutral-900 text-white font-medium shadow"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <span>Agent Chat</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "chat" ? (
            /* Interactive Agent Chat Tab */
            <div className="flex flex-col h-[500px]">
              <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-neutral-950 rounded-xl border border-neutral-800 font-sans text-xs sm:text-sm">
                {chatHistory.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {m.role === "agent" && (
                      <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-xs shrink-0">
                        🤖
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2.5 leading-relaxed ${
                        m.role === "user"
                          ? "bg-emerald-600 text-white"
                          : "bg-neutral-900 border border-neutral-800 text-neutral-200 whitespace-pre-wrap"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3 items-center text-neutral-400 text-xs">
                    <span className="animate-spin text-sm">⏳</span> Agent is thinking...
                  </div>
                )}
              </div>

              <form onSubmit={handleSendChatMessage} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Ask the Google ADK Agent a question about this issue or fix..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatMessage.trim()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Send
                </button>
              </form>
            </div>
          ) : (
            /* Main Handoff Flow Tab */
            <>
              {/* Pipeline Stepper */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                    step === "opt_in"
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : "bg-neutral-950 border-neutral-800 text-neutral-400"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center font-mono font-bold text-[10px]">
                    1
                  </span>
                  <span>Human Opt-In</span>
                </div>

                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                    step === "fork"
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : step === "synthesizing" || step === "routing" || step === "completed"
                      ? "bg-neutral-950 border-neutral-800 text-emerald-400"
                      : "bg-neutral-950 border-neutral-800 text-neutral-500"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center font-mono font-bold text-[10px]">
                    2
                  </span>
                  <span>Lazy Fork</span>
                </div>

                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                    step === "synthesizing"
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : step === "routing" || step === "completed"
                      ? "bg-neutral-950 border-neutral-800 text-emerald-400"
                      : "bg-neutral-950 border-neutral-800 text-neutral-500"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center font-mono font-bold text-[10px]">
                    3
                  </span>
                  <span>Code Synthesis</span>
                </div>

                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                    step === "completed"
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : step === "routing"
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : "bg-neutral-950 border-neutral-800 text-neutral-500"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center font-mono font-bold text-[10px]">
                    4
                  </span>
                  <span>PR / Plan</span>
                </div>
              </div>

              {/* Step 1: Opt-In Confirmation Card */}
              {step === "opt_in" && (
                <div className="space-y-4 bg-neutral-950/60 p-5 rounded-xl border border-neutral-800">
                  <div className="flex items-start gap-3">
                    <div className="text-xl">🛡️</div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-white">
                        Human-in-the-Loop Confirmation Gate
                      </h4>
                      <p className="text-xs text-neutral-400 leading-relaxed">
                        To protect your repositories, flux enforces lazy forking and explicit authorization.
                        No fork is created and no code is edited until you authorize the agent handoff.
                      </p>
                    </div>
                  </div>

                  {explanation && explanation.relevant_files && explanation.relevant_files.length > 0 && (
                    <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800 space-y-2">
                      <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                        Grounded 1-Hop Graph Context:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {explanation.relevant_files.map((rf, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 font-mono text-xs bg-neutral-800 text-emerald-400 rounded border border-neutral-700"
                          >
                            {rf.file}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-medium text-neutral-300">
                      Optional Developer Instructions for Agent:
                    </label>
                    <input
                      type="text"
                      value={userNotes}
                      onChange={(e) => setUserNotes(e.target.value)}
                      placeholder="e.g. Ensure backwards compatibility with existing event schemas"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="optInCheck"
                      checked={optInConfirmed}
                      onChange={(e) => setOptInConfirmed(e.target.checked)}
                      className="rounded border-neutral-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="optInCheck" className="text-xs text-neutral-300 cursor-pointer">
                      I authorize the Google ADK Agent to provision a fork and generate code modifications.
                    </label>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded-lg">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-3 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteHandoff}
                      disabled={!optInConfirmed}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-950"
                    >
                      <span>🚀 Authorize &amp; Execute Handoff</span>
                      <span>&rarr;</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Progress State (Fork / Code Synthesis / Routing) */}
              {(step === "fork" || step === "synthesizing" || step === "routing") && (
                <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
                  <div className="w-12 h-12 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white">
                      {step === "fork" && "Provisioning Asynchronous Lazy Fork via LongRunningFunctionTool..."}
                      {step === "synthesizing" && "Synthesizing Grounded Patch with Google GenAI..."}
                      {step === "routing" && "Evaluating Diff Complexity & Formatting Route..."}
                    </h4>
                    <p className="text-xs text-neutral-400">
                      Google ADK Agent is executing autonomous triage and code resolution for #{issue.number}.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 4: Resolution Completed View */}
              {step === "completed" && result && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  {/* Status Banner */}
                  <div className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-950 border-neutral-800">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {result.decision === "pr" ? (
                          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1.5">
                            <span>✓</span> Contained Fix &rarr; Pull Request Opened
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-950 text-amber-300 border border-amber-700 flex items-center gap-1.5">
                            <span>⚠️</span> High Complexity &rarr; Implementation Plan
                          </span>
                        )}
                        <span className="text-xs text-neutral-400">
                          ({result.diff_stats?.line_count || 0} lines changed, {result.diff_stats?.files_touched.length || 1} file touched)
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300">{result.message}</p>
                    </div>

                    {result.decision === "pr" && result.pr && (
                      <a
                        href={result.pr.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition-colors shrink-0 flex items-center gap-1.5 shadow-md shadow-emerald-950"
                      >
                        <span>View PR #{result.pr.pr_number}</span>
                        <span>↗</span>
                      </a>
                    )}
                  </div>

                  {/* Plan Artifact Display (if High Complexity) */}
                  {result.plan && (
                    <div className="p-4 bg-amber-950/15 border border-amber-800/40 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                          Structured Implementation Plan
                        </h5>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-700/50">
                          Risk: {result.plan.estimated_risk}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300">{result.plan.summary}</p>
                      <div className="space-y-1 pt-1">
                        {result.plan.steps.map((st, sIdx) => (
                          <div key={sIdx} className="text-xs text-neutral-300 flex items-start gap-2">
                            <span className="text-amber-400 font-bold">•</span>
                            <span>{st}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unified Diff Viewer */}
                  {result.diff && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                            Generated Unified Patch Diff
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400">
                            (diff -u)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyDiff}
                          className="text-xs px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          {copiedDiff ? "✓ Copied!" : "📋 Copy Diff"}
                        </button>
                      </div>

                      <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4 font-mono text-xs overflow-x-auto max-h-72">
                        {result.diff.split("\n").map((line: string, lIdx: number) => {
                          const isAdd = line.startsWith("+") && !line.startsWith("+++");
                          const isDel = line.startsWith("-") && !line.startsWith("---");
                          const isHeader = line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++");
                          return (
                            <div
                              key={lIdx}
                              className={`leading-relaxed whitespace-pre ${
                                isAdd
                                  ? "text-emerald-400 bg-emerald-950/20"
                                  : isDel
                                  ? "text-red-400 bg-red-950/20"
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
                  <div className="flex items-center justify-between pt-3 border-t border-neutral-800 text-xs">
                    <div className="text-neutral-500">
                      Fork reference: <span className="font-mono text-neutral-400">{result.fork?.fork_ref}</span>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Error State */}
              {step === "error" && (
                <div className="p-6 bg-red-950/20 border border-red-800/60 rounded-xl space-y-3 text-center">
                  <div className="text-2xl">⚠️</div>
                  <h4 className="text-sm font-bold text-red-300">Agent Handoff Execution Failed</h4>
                  <p className="text-xs text-neutral-400 max-w-md mx-auto">{error}</p>
                  <button
                    type="button"
                    onClick={() => setStep("opt_in")}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
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
