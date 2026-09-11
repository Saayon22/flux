"use client";
// Autonomous code resolution handoff modal and interactive agent workbench.

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
import {
  Bot,
  GitPullRequest,
  Terminal,
  Copy,
  Check,
  ExternalLink,
  X,
  FileCode,
  RotateCcw,
  Send,
  CheckCircle2,
  AlertCircle,
  CloudCog,
  MessageSquare,
} from "lucide-react";

interface AgentHandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  issue: IssueSummary;
  explanation?: IssueExplanation | null;
}

type HandoffStep = "opt_in" | "fork" | "synthesizing" | "routing" | "completed" | "error";

// Extracts error message string safely from unknown error.
const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

// Renders autonomous resolution workbench modal with patch diffs and chat.
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
          text: `Initialized FLUX Agent. Ready to resolve Issue #${issue.number} ("${issue.title}"). Confirm opt-in to launch autonomous pipeline.`,
        },
      ]);

      getHandoffResult(owner, repo, issue.number).then((cached) => {
        if (cached) {
          setResult(cached);
          setStep("completed");
          if (cached.decision === "pr" && cached.pr) {
            setChatHistory((prev) => [
              ...prev,
              {
                role: "agent",
                text: `Retrieved persisted Pull Request: #${cached.pr?.pr_number} (${cached.pr?.pr_url}).`,
              },
            ]);
          }
        }
      });
    }
  }, [isOpen, owner, repo, issue]);

  // Listens for Escape key press to dismiss modal dialog.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Triggers autonomous code resolution pipeline with optional directives.
  const handleStartHandoff = async () => {
    if (!optInConfirmed) return;
    setLoading(true);
    setError(null);
    setStep("synthesizing");

    try {
      const response = await triggerAgentHandoff(owner, repo, issue.number, optInConfirmed, userNotes);
      setResult(response);
      setStep("completed");
      const decisionType = response.decision || "plan";
      setChatHistory((prev) => [
        ...prev,
        {
          role: "agent",
          text: `Autonomous run completed. Decision: ${decisionType.toUpperCase()}. ${
            decisionType === "pr"
              ? "Pull Request patch synthesized."
              : "Plan Artifact generated for human review."
          }`,
        },
      ]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Agent handoff failed to execute."));
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  // Publishes verified resolution diff as a GitHub pull request.
  const handlePublishPR = async () => {
    if (!result) return;
    setPublishingPR(true);
    try {
      const res = await publishPullRequest(owner, repo, issue.number);
      if (res.status === "pr_published" && res.pr) {
        setResult((prev) =>
          prev
            ? {
                ...prev,
                pr: res.pr,
              }
            : null
        );
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to publish PR to GitHub."));
    } finally {
      setPublishingPR(false);
    }
  };

  // Rolls back local handoff git commits and workspace state.
  const handleRollback = async () => {
    setRollingBack(true);
    try {
      await rollbackHandoff(owner, repo, issue.number);
      setResult(null);
      setStep("opt_in");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Rollback failed."));
    } finally {
      setRollingBack(false);
    }
  };

  // Sends prompt to autonomous agent and appends response to chat history.
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || chatLoading) return;

    const userText = chatMessage.trim();
    setChatMessage("");
    setChatHistory((prev) => [...prev, { role: "user", text: userText }]);
    setChatLoading(true);

    try {
      const reply = await chatWithAgent(userText);
      setChatHistory((prev) => [...prev, { role: "agent", text: reply.response }]);
    } catch (err: unknown) {
      setChatHistory((prev) => [
        ...prev,
        {
          role: "agent",
          text: `Error processing query: ${getErrorMessage(err, "Communication error.")}`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Copies generated code diff to clipboard.
  const copyDiff = () => {
    if (result?.diff) {
      navigator.clipboard.writeText(result.diff);
      setCopiedDiff(true);
      setTimeout(() => setCopiedDiff(false), 2000);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(23,24,23,0.45)] backdrop-blur-md"
    >
      <div className="agent-handoff-modal bg-[#fffefa] border border-[rgba(23,24,23,0.16)] rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs text-[#171817]">
        {/* Modal Header */}
        <div className="p-6 border-b border-[rgba(23,24,23,0.1)] flex items-center justify-between bg-[rgba(247,244,236,0.85)]">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#df7d4c] text-[#fffdf8] flex items-center justify-center font-bold shadow-md shadow-[#df7d4c]/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-[#171817] text-base">Agent Handoff Workbench</h3>
                <span className="text-[10px] px-2.5 py-0.5 bg-[rgba(23,24,23,0.06)] text-[#171817] rounded-md border border-[rgba(23,24,23,0.12)] font-code font-bold">
                  Issue #{issue.number}
                </span>
              </div>
              <p className="text-xs text-[#6b6963] truncate max-w-lg mt-0.5">{issue.title}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal dialog"
            className="p-2 text-[#6b6963] hover:text-[#171817] rounded-xl hover:bg-[rgba(23,24,23,0.08)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        {step === "completed" && (
          <div role="tablist" aria-label="Workbench Sections" className="flex border-b border-[rgba(23,24,23,0.1)] bg-[rgba(255,254,250,0.95)] text-xs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "resolution"}
              onClick={() => setActiveTab("resolution")}
              className={`flex-1 py-3.5 font-bold transition-all cursor-pointer flex items-center justify-center gap-2 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                activeTab === "resolution"
                  ? "text-[#df7d4c] border-[#df7d4c] bg-[rgba(223,125,76,0.08)]"
                  : "text-[#6b6963] border-transparent hover:text-[#171817]"
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>Resolution Patch &amp; Diffs</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
              className={`flex-1 py-3.5 font-bold transition-all cursor-pointer flex items-center justify-center gap-2 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                activeTab === "chat"
                  ? "text-[#df7d4c] border-[#df7d4c] bg-[rgba(223,125,76,0.08)]"
                  : "text-[#6b6963] border-transparent hover:text-[#171817]"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Interactive Agent Chat ({chatHistory.length})</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          {error && (
            <div className="p-4 alert-terracotta-error rounded-2xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Opt-in Consent */}
          {step === "opt_in" && (
            <div className="space-y-6 max-w-xl mx-auto py-4">
              <div className="bg-[rgba(247,244,236,0.65)] border border-[rgba(23,24,23,0.12)] rounded-2xl p-6 space-y-3.5 shadow-xs">
                <div className="flex items-center gap-2 text-[#171817] font-extrabold text-sm">
                  <CloudCog className="w-4 h-4 text-[#df7d4c]" strokeWidth={2.25} />
                  <span>Autonomous Multi-File Resolution Dispatch</span>
                </div>
                <p className="text-[#6b6963] leading-relaxed text-xs">
                  The autonomous agent will analyze AST caller/dependency networks, load impacted
                  files into context, generate code modifications, and deliver verified Pull Request diffs.
                </p>

                <label className="flex items-start gap-3 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={optInConfirmed}
                    onChange={(e) => setOptInConfirmed(e.target.checked)}
                    className="mt-0.5 rounded bg-[#fffefa] border-[rgba(23,24,23,0.25)] text-[#df7d4c]"
                  />
                  <span className="text-[#171817] text-xs leading-relaxed font-semibold">
                    Authorize autonomous agent to execute grounded code synthesis on local workspace.
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#171817] font-bold">Additional Directives (Optional):</label>
                <textarea
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="e.g., Ensure backward compatibility with existing tests and API contracts..."
                  rows={3}
                  className="w-full p-3.5 bg-[#fffefa] border border-[rgba(23,24,23,0.14)] rounded-2xl text-[#171817] placeholder-[rgba(23,24,23,0.4)] focus:outline-none focus:border-[#df7d4c]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-outline-white px-5 py-2.5 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartHandoff}
                  disabled={!optInConfirmed || loading}
                  className="btn-terracotta px-6 py-2.5 text-xs font-bold cursor-pointer flex items-center gap-2 shadow-md"
                >
                  <Bot className="w-4 h-4" />
                  <span>Execute Agent</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Running Pipeline Animation */}
          {(step === "synthesizing" || loading) && (
            <div className="py-20 text-center space-y-4">
              <div className="w-10 h-10 border-3 border-[#df7d4c] border-t-transparent rounded-full animate-spin mx-auto"></div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-[#171817] text-base">Agent Synthesizing Solution...</h4>
                <p className="text-[#77756f] text-xs">
                  Evaluating AST dependencies, calculating imports, generating code patches.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Completed Result */}
          {step === "completed" && result && (
            <div>
              {activeTab === "resolution" && (
                <div className="space-y-5">
                  {/* Status Banner */}
                  <div className="p-5 bg-[rgba(223,125,76,0.08)] border border-[rgba(223,125,76,0.22)] rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#df7d4c]" />
                      <div>
                        <span className="font-extrabold text-[#171817] text-sm">
                          {result.decision === "pr" ? "Pull Request Synthesized" : "Plan Artifact Created"}
                        </span>
                        <p className="text-xs text-[#77756f] mt-0.5">{result.message}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {result.decision === "pr" && !result.pr?.pr_url && (
                        <button
                          type="button"
                          onClick={handlePublishPR}
                          disabled={publishingPR}
                          className="btn-terracotta px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer font-bold shadow-md"
                        >
                          <GitPullRequest className="w-4 h-4" />
                          <span>{publishingPR ? "Publishing..." : "Publish PR"}</span>
                        </button>
                      )}

                      {result.pr?.pr_url && (
                        <a
                          href={result.pr.pr_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-white px-4 py-2 text-xs flex items-center gap-1.5 font-bold"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>View PR #{result.pr.pr_number}</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={handleRollback}
                        disabled={rollingBack}
                        className="btn-outline-white px-3.5 py-2 text-xs cursor-pointer flex items-center gap-1.5"
                        title="Rollback handoff changes"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>

                  {/* Diff Viewer */}
                  {result.diff && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#171817] font-bold text-xs uppercase tracking-wider">
                          Code Patch Preview ({result.diff_stats?.files_touched?.length || 1} files)
                        </span>
                        <button
                          type="button"
                          onClick={copyDiff}
                          aria-label="Copy diff patch to clipboard"
                          className="btn-white px-3 py-1 text-xs cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
                        >
                          {copiedDiff ? <Check className="w-3.5 h-3.5 text-[#df7d4c]" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedDiff ? "Copied" : "Copy Diff"}</span>
                        </button>
                      </div>

                      <div className="bg-[#f4efe6] border border-[rgba(23,24,23,0.12)] rounded-2xl p-4 overflow-x-auto max-h-80 text-xs font-code leading-relaxed text-[#171817]">
                        <pre className="space-y-0.5">
                          {result.diff.split("\n").map((line, lIdx) => {
                            const isAdded = line.startsWith("+") && !line.startsWith("+++");
                            const isRemoved = line.startsWith("-") && !line.startsWith("---");
                            const isHunk = line.startsWith("@@");
                            return (
                              <div
                                key={lIdx}
                                className={`px-1 rounded-xs ${
                                  isAdded
                                    ? "bg-[rgba(34,197,94,0.12)] text-[#15803d]"
                                    : isRemoved
                                    ? "bg-[rgba(239,68,68,0.12)] text-[#b91c1c]"
                                    : isHunk
                                    ? "text-[#df7d4c] font-bold"
                                    : "text-[#171817]"
                                }`}
                              >
                                {line || " "}
                              </div>
                            );
                          })}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Plan Artifact */}
                  {result.plan && (
                    <div className="space-y-2">
                      <span className="text-[#171817] font-bold text-xs uppercase tracking-wider">
                        Architectural Plan: {result.plan.title}
                      </span>
                      <div className="bg-[#fffefa] border border-[rgba(23,24,23,0.12)] rounded-2xl p-5 text-xs font-code leading-relaxed text-[#171817] whitespace-pre-wrap shadow-xs">
                        {result.plan.markdown_content || result.plan.summary}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Agent Chat */}
              {activeTab === "chat" && (
                <div className="space-y-4">
                  <div className="bg-[#f7f4ec] border border-[rgba(23,24,23,0.1)] rounded-2xl p-4 max-h-80 overflow-y-auto space-y-3">
                    {chatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                          msg.role === "agent"
                            ? "bg-[#fffefa] border border-[rgba(23,24,23,0.1)] text-[#171817] shadow-xs"
                            : "bg-[#df7d4c] text-[#fffdf8] font-semibold ml-8 shadow-xs"
                        }`}
                      >
                        <div className="text-[10px] opacity-75 font-bold mb-1 uppercase tracking-wider">
                          {msg.role === "agent" ? "FLUX Agent" : "You"}
                        </div>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="text-[#77756f] text-xs italic">Agent is thinking...</div>
                    )}
                  </div>

                  <form onSubmit={handleSendMessage} className="flex gap-3">
                    <input
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      placeholder="Ask the agent about this code patch or give instructions..."
                      className="flex-1 px-4 py-3 bg-[#fffefa] border border-[rgba(23,24,23,0.14)] rounded-2xl text-[#171817] placeholder-[rgba(23,24,23,0.4)] text-xs focus:outline-none focus:border-[#df7d4c]"
                    />
                    <button
                      type="submit"
                      disabled={!chatMessage.trim() || chatLoading}
                      className="btn-terracotta px-5 py-3 text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-md"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
