"use client";

/**
 * Main Page for flux (Phases 1-3: Ingestion, AST Dependency Graph, and Repository Understanding).
 * Allows users to ingest a GitHub repository, view the Obsidian-style dependency graph,
 * and generate grounded plain-English repository understanding with overview, feature map, and architecture flow.
 */

import React, { useState, useRef } from "react";
import {
  ingestRepository,
  buildRepoGraph,
  getRepoGraph,
  generateRepoUnderstanding,
  getRepoUnderstanding,
  getAgentStatus,
  RepoMetadata,
  GraphResponse,
  RepoUnderstanding,
  IssueSummary,
  IssueExplanation,
  AgentStatusResponse,
} from "./lib/api";
import ObsidianGraphCanvas from "./components/ObsidianGraphCanvas";
import IssueExplorer from "./components/IssueExplorer";
import AgentHandoffModal from "./components/AgentHandoffModal";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState<RepoMetadata | null>(null);
  const [activeTab, setActiveTab] = useState<"readme" | "contributing">("readme");

  // Phase 2: Graph State
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  // Phase 3: Repository Understanding State
  const [understanding, setUnderstanding] = useState<RepoUnderstanding | null>(null);
  const [understandingLoading, setUnderstandingLoading] = useState(false);
  const [understandingError, setUnderstandingError] = useState<string | null>(null);
  const [understandingTab, setUnderstandingTab] = useState<"overview" | "architecture" | "features">("overview");

  // Phase 4: Graph Explorer Focused Node & Section Scroll
  const [focusedGraphNodeId, setFocusedGraphNodeId] = useState<string | null>(null);
  const graphSectionRef = useRef<HTMLDivElement | null>(null);

  // Phase 6 & 7: Google ADK Agent Handoff State
  const [handoffIssue, setHandoffIssue] = useState<IssueSummary | null>(null);
  const [handoffExplanation, setHandoffExplanation] = useState<IssueExplanation | null>(null);
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);

  // Phase 8: System Status & Demo Hardening State
  const [systemStatus, setSystemStatus] = useState<AgentStatusResponse | null>(null);
  const [autoPipelineRunning, setAutoPipelineRunning] = useState(false);
  const [autoPipelineStep, setAutoPipelineStep] = useState<string>("");

  React.useEffect(() => {
    getAgentStatus()
      .then((data) => setSystemStatus(data))
      .catch(() => {});
  }, []);

  const DEMO_REPOS = [
    {
      name: "Roxy-06/Eduzen",
      url: "https://github.com/Roxy-06/Eduzen",
      badge: "Python + React RAG",
      desc: "Full-Stack Showcase",
    },
    {
      name: "octocat/Hello-World",
      url: "https://github.com/octocat/Hello-World",
      badge: "C / Minimal",
      desc: "1-Click PR Demo",
    },
    {
      name: "pallets/flask",
      url: "https://github.com/pallets/flask",
      badge: "Python Web Framework",
      desc: "Large AST Graph",
    },
  ];

  const handleAutoPipeline = async (overrideUrl?: string) => {
    const urlToRun = (overrideUrl || repoUrl).trim();
    if (!urlToRun) return;

    if (overrideUrl) {
      setRepoUrl(overrideUrl);
    }

    setAutoPipelineRunning(true);
    setLoading(true);
    setError(null);
    setGraph(null);
    setGraphError(null);
    setUnderstanding(null);
    setUnderstandingError(null);

    try {
      // Step 1: Ingestion
      setAutoPipelineStep("Cloning and ingesting repository into workspaces...");
      const ingestRes = await ingestRepository(urlToRun);
      setRepo(ingestRes.repository);
      setActiveTab("readme");

      // Step 2: AST Dependency Graph
      setAutoPipelineStep("Parsing Tree-sitter AST & NetworkX dependency graph...");
      setGraphLoading(true);
      const graphRes = await buildRepoGraph(ingestRes.repository.owner, ingestRes.repository.name);
      setGraph(graphRes);
      setGraphLoading(false);

      // Step 3: Architecture Understanding
      setAutoPipelineStep("Synthesizing grounded architecture understanding with Gemini 3.6 Flash...");
      setUnderstandingLoading(true);
      const underRes = await generateRepoUnderstanding(ingestRes.repository.owner, ingestRes.repository.name);
      setUnderstanding(underRes);
      setUnderstandingLoading(false);

      setAutoPipelineStep("Full Analysis completed successfully!");
      setTimeout(() => setAutoPipelineStep(""), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Autonomous pipeline failed.";
      setError(msg);
    } finally {
      setLoading(false);
      setGraphLoading(false);
      setUnderstandingLoading(false);
      setAutoPipelineRunning(false);
    }
  };

  const handleSelectDemo = (url: string) => {
    setRepoUrl(url);
    handleAutoPipeline(url);
  };

  const handleJumpToNode = (nodeId: string) => {
    setFocusedGraphNodeId(nodeId);
    if (graphSectionRef.current) {
      graphSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  /**
   * Handles submission of the GitHub URL.
   * Ingests the repository, then checks if a dependency graph or understanding already exists.
   */
  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setLoading(true);
    setError(null);
    setGraph(null);
    setGraphError(null);
    setUnderstanding(null);
    setUnderstandingError(null);

    try {
      const response = await ingestRepository(repoUrl.trim());
      setRepo(response.repository);
      setActiveTab("readme");

      // Check if this repository already has a computed dependency graph
      try {
        const existingGraph = await getRepoGraph(
          response.repository.owner,
          response.repository.name
        );
        if (existingGraph) {
          setGraph(existingGraph);
        }
      } catch {
        // Graph not yet computed
      }

      // Check if this repository already has cached understanding
      try {
        const existingUnderstanding = await getRepoUnderstanding(
          response.repository.owner,
          response.repository.name
        );
        if (existingUnderstanding) {
          setUnderstanding(existingUnderstanding);
        }
      } catch {
        // Understanding not yet generated
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Triggers Tree-sitter AST parsing and NetworkX graph generation.
   */
  const handleBuildGraph = async () => {
    if (!repo) return;
    setGraphLoading(true);
    setGraphError(null);

    try {
      const graphData = await buildRepoGraph(repo.owner, repo.name);
      setGraph(graphData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to build dependency graph.";
      setGraphError(message);
    } finally {
      setGraphLoading(false);
    }
  };

  /**
   * Generates plain-English repository understanding (overview, feature map, architecture flow).
   */
  const handleGenerateUnderstanding = async () => {
    if (!repo) return;
    setUnderstandingLoading(true);
    setUnderstandingError(null);

    try {
      const result = await generateRepoUnderstanding(repo.owner, repo.name);
      setUnderstanding(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate repository understanding.";
      setUnderstandingError(message);
    } finally {
      setUnderstandingLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-5xl space-y-6">
        {/* Phase 8: Global System Status Bar */}
        <div className="w-full flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-neutral-900/80 border border-neutral-800/80 rounded-xl text-xs backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold text-neutral-200">flux Engine:</span>
            <span className="text-emerald-400 font-mono font-medium">
              {systemStatus?.status === "online" ? "Active" : "Ready"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Gemini Status */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-950 border border-neutral-800 text-neutral-300">
              <span className="text-emerald-400">⚡</span>
              <span className="font-mono text-[11px]">Gemini 3.6 Flash</span>
            </div>

            {/* Google ADK Multi-Agent */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-950 border border-neutral-800 text-neutral-300">
              <span className="text-sky-400">🤖</span>
              <span className="font-mono text-[11px]">Google ADK Multi-Agent</span>
            </div>

            {/* GitHub API Rate Limit */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-950 border border-neutral-800 text-neutral-300">
              <span className="text-amber-400">🐙</span>
              <span className="text-[11px]">
                {systemStatus?.github?.user ? `@${systemStatus.github.user}` : "GitHub API"}
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">
                ({systemStatus?.github?.remaining ?? 5000}/{systemStatus?.github?.limit ?? 5000} req/hr)
              </span>
            </div>
          </div>
        </div>

        {/* Header Section */}
        <div className="text-center space-y-2 pt-2">
          <div className="inline-block px-3 py-1 text-xs font-semibold tracking-wider text-emerald-400 uppercase bg-emerald-950/60 border border-emerald-800/40 rounded-full">
            Autonomous Multi-Agent Repository Intelligence
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            flux
          </h1>
          <p className="text-sm sm:text-base text-neutral-400 max-w-xl mx-auto">
            Grounded repository understanding with AST dependency graphs, plain-English architecture summaries,
            issue triage, and autonomous code handoff.
          </p>
        </div>

        {/* Phase 8: 5-Step Pipeline Progress Stepper */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div
            className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all ${
              repo
                ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
                : loading && !graphLoading && !understandingLoading
                ? "bg-neutral-900 border-sky-500/60 text-sky-300 animate-pulse"
                : "bg-neutral-900/40 border-neutral-800/60 text-neutral-500"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold">STEP 01</span>
              <span>{repo ? "✓" : "○"}</span>
            </div>
            <span className="font-medium">1. Ingestion</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all ${
              graph
                ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
                : graphLoading
                ? "bg-neutral-900 border-sky-500/60 text-sky-300 animate-pulse"
                : "bg-neutral-900/40 border-neutral-800/60 text-neutral-500"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold">STEP 02</span>
              <span>{graph ? "✓" : "○"}</span>
            </div>
            <span className="font-medium">2. AST Graph</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all ${
              understanding
                ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
                : understandingLoading
                ? "bg-neutral-900 border-sky-500/60 text-sky-300 animate-pulse"
                : "bg-neutral-900/40 border-neutral-800/60 text-neutral-500"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold">STEP 03</span>
              <span>{understanding ? "✓" : "○"}</span>
            </div>
            <span className="font-medium">3. Understanding</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all ${
              repo
                ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
                : "bg-neutral-900/40 border-neutral-800/60 text-neutral-500"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold">STEP 04</span>
              <span>{repo ? "✓" : "○"}</span>
            </div>
            <span className="font-medium">4. Issue Discovery</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all ${
              repo
                ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
                : "bg-neutral-900/40 border-neutral-800/60 text-neutral-500"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold">STEP 05</span>
              <span>{repo ? "⚡" : "○"}</span>
            </div>
            <span className="font-medium">5. Google ADK Agent</span>
          </div>
        </div>

        {/* Input Form Section */}
        <form onSubmit={handleIngest} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
              disabled={loading || autoPipelineRunning}
              className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm font-mono"
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading || autoPipelineRunning || !repoUrl.trim()}
                className="px-5 py-3 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600 text-neutral-200 font-medium rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shrink-0 border border-neutral-700/60"
              >
                {loading && !autoPipelineRunning ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Ingesting...</span>
                  </>
                ) : (
                  "Ingest Repo"
                )}
              </button>

              <button
                type="button"
                onClick={() => handleAutoPipeline()}
                disabled={loading || autoPipelineRunning || !repoUrl.trim()}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-900 disabled:text-neutral-600 text-white font-semibold rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shrink-0 shadow-lg shadow-emerald-950"
              >
                {autoPipelineRunning ? (
                  <>
                    <span className="animate-spin text-sm">⚡</span>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ 1-Click Full Analysis</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick-Start Demo Rehearsal Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-neutral-400 font-semibold flex items-center gap-1">
              <span>🎯</span>
              <span>1-Click Live Rehearsal:</span>
            </span>
            {DEMO_REPOS.map((demo, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectDemo(demo.url)}
                disabled={loading || autoPipelineRunning}
                className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/60 text-xs text-neutral-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <span className="font-mono text-emerald-400 font-medium">{demo.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/50">
                  {demo.badge}
                </span>
              </button>
            ))}
          </div>
        </form>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-red-950/50 border border-red-800/60 rounded-xl text-sm text-red-200">
            <span className="font-semibold text-red-400">Pipeline Error: </span>
            {error}
          </div>
        )}

        {/* Loading Progress State */}
        {(loading || autoPipelineRunning) && (
          <div className="p-8 border border-neutral-800 bg-neutral-900/50 rounded-xl text-center space-y-3 animate-pulse">
            <div className="text-sm font-medium text-emerald-400">
              {autoPipelineStep || "Cloning repository into local workspaces..."}
            </div>
            <div className="text-xs text-neutral-400">
              Executing grounded repository analysis pipeline (Shallow Git Clone &rarr; AST Dependency Graph &rarr; Gemini Understanding).
            </div>
          </div>
        )}

        {/* Ingested Repository Result Card */}
        {repo && !loading && (
          <div className="border border-neutral-800 bg-neutral-900/60 rounded-xl overflow-hidden shadow-lg space-y-6 p-6">
            {/* Repo Title & Details & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-white">
                    {repo.owner}/{repo.name}
                  </h2>
                  <span className="px-2.5 py-0.5 text-xs font-medium bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-full">
                    {repo.status.toUpperCase()}
                  </span>
                </div>
                {repo.description && (
                  <p className="text-sm text-neutral-400 mt-1">{repo.description}</p>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-center">
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-400 hover:text-white underline underline-offset-4 mr-1"
                >
                  GitHub &rarr;
                </a>

                {/* Build Dependency Graph Action Button */}
                <button
                  type="button"
                  onClick={handleBuildGraph}
                  disabled={graphLoading}
                  className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600 text-neutral-200 font-medium rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed border border-neutral-700/60"
                >
                  {graphLoading ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Parsing AST...</span>
                    </>
                  ) : graph ? (
                    "Rebuild Graph"
                  ) : (
                    "Build Graph"
                  )}
                </button>

                {/* Generate Repository Understanding Action Button */}
                <button
                  type="button"
                  onClick={handleGenerateUnderstanding}
                  disabled={understandingLoading}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-medium rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow"
                >
                  {understandingLoading ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Analyzing...</span>
                    </>
                  ) : understanding ? (
                    "Regenerate Understanding"
                  ) : (
                    "Understand Repository"
                  )}
                </button>
              </div>
            </div>

            {/* Metadata Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800/80">
                <div className="text-xs text-neutral-500">Language</div>
                <div className="text-sm font-semibold text-neutral-200 mt-0.5">
                  {repo.language || "Unknown"}
                </div>
              </div>
              <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800/80">
                <div className="text-xs text-neutral-500">Stars</div>
                <div className="text-sm font-semibold text-neutral-200 mt-0.5">
                  {repo.stars.toLocaleString()}
                </div>
              </div>
              <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800/80">
                <div className="text-xs text-neutral-500">Open Issues</div>
                <div className="text-sm font-semibold text-neutral-200 mt-0.5">
                  {repo.open_issues_count.toLocaleString()}
                </div>
              </div>
              <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800/80">
                <div className="text-xs text-neutral-500">Files Cloned</div>
                <div className="text-sm font-semibold text-neutral-200 mt-0.5">
                  {repo.file_count.toLocaleString()} files
                </div>
              </div>
            </div>

            {/* Workspace Path Indicator */}
            <div className="bg-neutral-950/60 p-3 rounded-lg border border-neutral-800 text-xs font-mono text-neutral-400 flex items-center justify-between">
              <span>Local Workspace:</span>
              <span className="text-emerald-400">{repo.clone_path}</span>
            </div>

            {/* Phase 3: Repository Understanding View */}
            {understandingLoading && (
              <div className="p-6 border border-neutral-800 bg-neutral-900/30 rounded-xl text-center space-y-2 animate-pulse">
                <div className="text-sm font-medium text-emerald-400">
                  Synthesizing repository understanding...
                </div>
                <div className="text-xs text-neutral-500">
                  Distilling AST graph metrics, central files, and documentation into plain-English architecture.
                </div>
              </div>
            )}

            {understandingError && (
              <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-xs text-red-200">
                <span className="font-semibold text-red-400">Understanding Error: </span>
                {understandingError}
              </div>
            )}

            {understanding && !understandingLoading && (
              <div className="border border-neutral-800 bg-neutral-950/70 rounded-xl p-5 space-y-4">
                {/* Header with Fallback / Engine Indicator */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-neutral-200">
                      Repository Understanding
                    </span>
                    {/* Fallback vs Live LLM Indicator */}
                    {understanding.is_fallback ? (
                      <span
                        className="px-2 py-0.5 text-[11px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800/70 rounded-full flex items-center gap-1.5"
                        title="Generated using deterministic graph metrics and README heuristics"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        Grounded Fallback Engine
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/70 rounded-full flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Model: {understanding.model_used}
                      </span>
                    )}
                  </div>

                  {/* Understanding Tabs */}
                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setUnderstandingTab("overview")}
                      className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                        understandingTab === "overview"
                          ? "bg-neutral-800 text-emerald-400 font-medium"
                          : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      Overview
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnderstandingTab("architecture")}
                      className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                        understandingTab === "architecture"
                          ? "bg-neutral-800 text-emerald-400 font-medium"
                          : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      Architecture Flow
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnderstandingTab("features")}
                      className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                        understandingTab === "features"
                          ? "bg-neutral-800 text-emerald-400 font-medium"
                          : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      Feature Map ({understanding.feature_map.length})
                    </button>
                  </div>
                </div>

                {/* Tab Content 1: Overview */}
                {understandingTab === "overview" && (
                  <div className="space-y-3 text-xs sm:text-sm text-neutral-300 leading-relaxed">
                    <p>{understanding.overview}</p>
                  </div>
                )}

                {/* Tab Content 2: Architecture Flow */}
                {understandingTab === "architecture" && (
                  <div className="space-y-4">
                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                      {understanding.architecture_summary}
                    </p>

                    {/* Architecture Component Flows */}
                    {understanding.flows && understanding.flows.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {understanding.flows.map((flow, i) => (
                          <div
                            key={i}
                            className="p-3 bg-neutral-900/80 rounded-lg border border-neutral-800 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-emerald-400 truncate">
                                {flow.component}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleJumpToNode(flow.central_file)}
                                className="font-mono text-[10px] text-neutral-400 hover:text-emerald-300 hover:underline truncate max-w-[150px] cursor-pointer flex items-center gap-1"
                                title={`Focus ${flow.central_file} in Graph Explorer`}
                              >
                                <span className="truncate">{flow.central_file}</span>
                                <span>&rarr;</span>
                              </button>
                            </div>
                            <p className="text-neutral-400 text-[11px]">{flow.role}</p>
                            {flow.connections && flow.connections.length > 0 && (
                              <div className="text-[10px] text-neutral-500 font-mono pt-1 flex flex-wrap items-center gap-1">
                                <span>Interacts with:</span>
                                {flow.connections.map((conn, cIdx) => (
                                  <button
                                    key={cIdx}
                                    type="button"
                                    onClick={() => handleJumpToNode(conn)}
                                    className="text-neutral-300 hover:text-sky-300 underline underline-offset-2 cursor-pointer font-mono"
                                    title={`Focus ${conn} in Graph Explorer`}
                                  >
                                    {conn}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content 3: Feature Map */}
                {understandingTab === "features" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      {understanding.feature_map.map((feat, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-neutral-900/80 rounded-lg border border-neutral-800 space-y-1.5"
                        >
                          <div className="font-semibold text-xs text-neutral-200">
                            {feat.name}
                          </div>
                          <p className="text-xs text-neutral-400">
                            {feat.description}
                          </p>
                          {feat.files && feat.files.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {feat.files.map((file, fIdx) => (
                                <button
                                  key={fIdx}
                                  type="button"
                                  onClick={() => handleJumpToNode(file)}
                                  className="px-2 py-0.5 bg-neutral-950 hover:bg-neutral-800 text-emerald-400 hover:text-emerald-300 font-mono text-[10px] rounded border border-neutral-800 transition-colors cursor-pointer flex items-center gap-1"
                                  title={`Locate ${file} in Graph Explorer`}
                                >
                                  <span>{file}</span>
                                  <span className="text-neutral-500">&rarr;</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Graph Error Alert */}
            {graphError && (
              <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-xs text-red-200">
                <span className="font-semibold text-red-400">Graph Error: </span>
                {graphError}
              </div>
            )}

            {/* Phase 4: Obsidian-Style Dependency Graph Explorer */}
            {graph && (
              <div ref={graphSectionRef} className="space-y-3 scroll-mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">
                    Repository Graph Explorer
                  </h3>
                  <div className="text-xs text-neutral-400">
                    60 FPS Force Simulation &bull; Clustering &bull; Search &bull; Code Inspector
                  </div>
                </div>
                <ObsidianGraphCanvas
                  owner={repo.owner}
                  repo={repo.name}
                  graph={graph}
                  focusedNodeId={focusedGraphNodeId}
                  onClearFocus={() => setFocusedGraphNodeId(null)}
                />
              </div>
            )}

            {/* Phase 5: GitHub Issue Discovery & Grounded Explanation */}
            <IssueExplorer
              owner={repo.owner}
              repo={repo.name}
              onSelectFile={handleJumpToNode}
              onPrepareAgentHandoff={(selectedIssue, exp) => {
                setHandoffIssue(selectedIssue);
                setHandoffExplanation(exp);
                setIsHandoffModalOpen(true);
              }}
            />

            {/* Phase 6 & 7: Google ADK Autonomous Agent Handoff Modal */}
            {handoffIssue && (
              <AgentHandoffModal
                isOpen={isHandoffModalOpen}
                onClose={() => setIsHandoffModalOpen(false)}
                owner={repo.owner}
                repo={repo.name}
                issue={handoffIssue}
                explanation={handoffExplanation}
              />
            )}

            {/* Documentation Tabs */}
            <div className="space-y-3 pt-2">
              <div className="flex border-b border-neutral-800 text-sm">
                <button
                  type="button"
                  onClick={() => setActiveTab("readme")}
                  className={`pb-2 px-3 font-medium transition-colors cursor-pointer ${
                    activeTab === "readme"
                      ? "text-emerald-400 border-b-2 border-emerald-400"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  README {repo.has_readme ? "✓" : "(None)"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("contributing")}
                  className={`pb-2 px-3 font-medium transition-colors cursor-pointer ${
                    activeTab === "contributing"
                      ? "text-emerald-400 border-b-2 border-emerald-400"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  CONTRIBUTING {repo.has_contributing ? "✓" : "(None)"}
                </button>
              </div>

              {/* Documentation Content Viewer */}
              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 max-h-72 overflow-y-auto font-mono text-xs text-neutral-300 whitespace-pre-wrap">
                {activeTab === "readme" ? (
                  repo.readme_content ? (
                    repo.readme_content
                  ) : (
                    <span className="text-neutral-500">No README document found in repository.</span>
                  )
                ) : repo.contributing_content ? (
                  repo.contributing_content
                ) : (
                  <span className="text-neutral-500">No CONTRIBUTING document found in repository.</span>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </main>
  );
}
