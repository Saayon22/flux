"use client";

/**
 * AgentHandoffModal.tsx
 * Akaru Prestige Edition: Autonomous Code Resolution Handoff Modal.
 */

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

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

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

  if (!isOpen) return null;

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

  const copyDiff = () => {
    if (result?.diff) {
      navigator.clipboard.writeText(result.diff);
      setCopiedDiff(true);
      setTimeout(() => setCopiedDiff(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#121212] border border-white/15 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#171717]">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#e49366] text-[#0e0e0e] flex items-center justify-center font-bold shadow-md">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-white text-base">Agent Handoff Workbench</h3>
                <span className="text-[10px] px-2.5 py-0.5 bg-white/10 text-white rounded-md border border-white/20 font-code font-bold">
                  Issue #{issue.number}
                </span>
              </div>
              <p className="text-xs text-[#9e9e9e] truncate max-w-lg mt-0.5">{issue.title}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/60 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        {step === "completed" && (
          <div className="flex border-b border-white/10 bg-[#141414] text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("resolution")}
              className={`flex-1 py-3.5 font-bold transition-all cursor-pointer flex items-center justify-center gap-2 border-b-2 ${
                activeTab === "resolution"
                  ? "text-[#e49366] border-[#e49366] bg-white/5"
                  : "text-white/60 border-transparent hover:text-white"
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>Resolution Patch &amp; Diffs</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={`flex-1 py-3.5 font-bold transition-all cursor-pointer flex items-center justify-center gap-2 border-b-2 ${
                activeTab === "chat"
                  ? "text-[#e49366] border-[#e49366] bg-white/5"
                  : "text-white/60 border-transparent hover:text-white"
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
            <div className="p-4 bg-red-950/60 border border-red-800 rounded-2xl text-red-300 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Opt-in Consent */}
          {step === "opt_in" && (
            <div className="space-y-6 max-w-xl mx-auto py-4">
              <div className="bg-[#171717] border border-white/10 rounded-2xl p-6 space-y-3.5 shadow-lg">
                <div className="flex items-center gap-2 text-white font-extrabold text-sm">
                  <CloudCog className="w-4 h-4 text-[#e49366]" strokeWidth={2.25} />
                  <span>Autonomous Multi-File Resolution Dispatch</span>
                </div>
                <p className="text-[#9e9e9e] leading-relaxed text-xs">
                  The autonomous agent will analyze AST caller/dependency networks, load impacted
                  files into context, generate code modifications, and deliver verified Pull Request diffs.
                </p>

                <label className="flex items-start gap-3 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={optInConfirmed}
                    onChange={(e) => setOptInConfirmed(e.target.checked)}
                    className="mt-0.5 rounded bg-[#0e0e0e] border-white/30 text-[#e49366]"
                  />
                  <span className="text-white text-xs leading-relaxed font-semibold">
                    Authorize autonomous agent to execute grounded code synthesis on local workspace.
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-white font-bold">Additional Directives (Optional):</label>
                <textarea
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="e.g., Ensure backward compatibility with existing tests and API contracts..."
                  rows={3}
                  className="w-full p-3.5 bg-[#0e0e0e] border border-white/15 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#e49366]"
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
                  className="btn-terracotta px-6 py-2.5 text-xs font-bold cursor-pointer flex items-center gap-2"
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
              <div className="w-10 h-10 border-3 border-[#e49366] border-t-transparent rounded-full animate-spin mx-auto"></div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-white text-base">Agent Synthesizing Solution...</h4>
                <p className="text-[#9e9e9e] text-xs">
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
                  <div className="p-5 bg-[#171717] border border-white/10 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#e49366]" />
                      <div>
                        <span className="font-extrabold text-white text-sm">
                          {result.decision === "pr" ? "Pull Request Synthesized" : "Plan Artifact Created"}
                        </span>
                        <p className="text-xs text-[#9e9e9e] mt-0.5">{result.message}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {result.decision === "pr" && !result.pr?.pr_url && (
                        <button
                          type="button"
                          onClick={handlePublishPR}
                          disabled={publishingPR}
                          className="btn-terracotta px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer font-bold"
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
                        <span className="text-white font-bold text-xs uppercase tracking-wider">
                          Code Patch Preview ({result.diff_stats?.files_touched?.length || 1} files)
                        </span>
                        <button
                          type="button"
                          onClick={copyDiff}
                          className="btn-white px-3 py-1 text-xs cursor-pointer flex items-center gap-1.5"
                        >
                          {copiedDiff ? <Check className="w-3.5 h-3.5 text-[#e49366]" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedDiff ? "Copied" : "Copy Diff"}</span>
                        </button>
                      </div>

                      <div className="bg-[#0e0e0e] border border-white/15 rounded-2xl p-4 overflow-x-auto max-h-80 text-xs font-code leading-relaxed text-white">
                        <pre>{result.diff}</pre>
                      </div>
                    </div>
                  )}

                  {/* Plan Artifact */}
                  {result.plan && (
                    <div className="space-y-2">
                      <span className="text-white font-bold text-xs uppercase tracking-wider">
                        Architectural Plan: {result.plan.title}
                      </span>
                      <div className="bg-[#0e0e0e] border border-white/15 rounded-2xl p-5 text-xs font-code leading-relaxed text-white whitespace-pre-wrap">
                        {result.plan.markdown_content || result.plan.summary}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Agent Chat */}
              {activeTab === "chat" && (
                <div className="space-y-4">
                  <div className="bg-[#0e0e0e] border border-white/15 rounded-2xl p-4 max-h-80 overflow-y-auto space-y-3">
                    {chatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                          msg.role === "agent"
                            ? "bg-[#171717] border border-white/10 text-white"
                            : "bg-[#e49366] text-[#0e0e0e] font-semibold ml-8 shadow-sm"
                        }`}
                      >
                        <div className="text-[10px] opacity-75 font-bold mb-1 uppercase tracking-wider">
                          {msg.role === "agent" ? "FLUX Agent" : "You"}
                        </div>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="text-[#9e9e9e] text-xs italic">Agent is thinking...</div>
                    )}
                  </div>

                  <form onSubmit={handleSendMessage} className="flex gap-3">
                    <input
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      placeholder="Ask the agent about this code patch or give instructions..."
                      className="flex-1 px-4 py-3 bg-[#0e0e0e] border border-white/15 rounded-2xl text-white placeholder-white/30 text-xs focus:outline-none focus:border-[#e49366]"
                    />
                    <button
                      type="submit"
                      disabled={!chatMessage.trim() || chatLoading}
                      className="btn-terracotta px-5 py-3 text-xs font-bold cursor-pointer flex items-center gap-1.5"
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
