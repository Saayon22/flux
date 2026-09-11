"use client";

/**
 * FLUX — Codebase Architecture & Autonomous Synthesis Platform.
 * Akaru Prestige Design System Edition:
 * - Primary: #e49366 (Warm Terracotta)
 * - Background: #0e0e0e (Gallery Near-Black)
 * - Surface/Cards: #151515 / #1c1c1c with crisp white and #9e9e9e borders
 * - Typography: Display Sans (Alliance Neue style) with high-contrast pure white text
 * - Bright, Non-Dark Buttons: Solid Terracotta #e49366 and Pure White #ffffff
 * - Static network graph with active warm terracotta data pulses.
 */

import React, { useState, useRef, useEffect } from "react";
import {
  ingestRepository,
  buildRepoGraph,
  getRepoGraph,
  generateRepoUnderstanding,
  getRepoUnderstanding,
  RepoMetadata,
  GraphResponse,
  RepoUnderstanding,
  IssueSummary,
  IssueExplanation,
} from "./lib/api";
import ObsidianGraphCanvas from "./components/ObsidianGraphCanvas";
import IssueExplorer from "./components/IssueExplorer";
import AgentHandoffModal from "./components/AgentHandoffModal";
import {
  GitBranch,
  Star,
  CircleDot,
  FileCode,
  Layers,
  CloudCog,
  ExternalLink,
  BookOpen,
  ArrowRight,
  Play,
  Search,
  Activity,
  FolderGit2,
} from "lucide-react";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState<RepoMetadata | null>(null);
  const [mainTab, setMainTab] = useState<"graph" | "understanding" | "issues" | "docs">("graph");
  const [docsTab, setDocsTab] = useState<"readme" | "contributing">("readme");

  // Graph State
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  // Repository Understanding State
  const [understanding, setUnderstanding] = useState<RepoUnderstanding | null>(null);
  const [understandingLoading, setUnderstandingLoading] = useState(false);
  const [understandingError, setUnderstandingError] = useState<string | null>(null);
  const [understandingTab, setUnderstandingTab] = useState<"overview" | "architecture" | "features">("overview");

  // Graph Explorer Focused Node
  const [focusedGraphNodeId, setFocusedGraphNodeId] = useState<string | null>(null);
  const graphSectionRef = useRef<HTMLDivElement | null>(null);

  // Agent Handoff State
  const [handoffIssue, setHandoffIssue] = useState<IssueSummary | null>(null);
  const [handoffExplanation, setHandoffExplanation] = useState<IssueExplanation | null>(null);
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);

  // Pipeline tracking
  const [autoPipelineRunning, setAutoPipelineRunning] = useState(false);
  const [autoPipelineStep, setAutoPipelineStep] = useState<string>("");

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
      setAutoPipelineStep("Phase 1/3: Ingesting repository & mapping AST hierarchy...");
      const ingestRes = await ingestRepository(urlToRun);
      setRepo(ingestRes.repository);

      setAutoPipelineStep("Phase 2/3: Building dependency network & calculating centrality...");
      setGraphLoading(true);
      const graphRes = await buildRepoGraph(ingestRes.repository.owner, ingestRes.repository.name);
      setGraph(graphRes);
      setGraphLoading(false);

      setAutoPipelineStep("Phase 3/3: Synthesizing architectural intelligence with Gemini...");
      setUnderstandingLoading(true);
      const underRes = await generateRepoUnderstanding(ingestRes.repository.owner, ingestRes.repository.name);
      setUnderstanding(underRes);
      setUnderstandingLoading(false);

      setAutoPipelineStep("Analysis complete.");
      setMainTab("graph");
      setTimeout(() => setAutoPipelineStep(""), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Pipeline execution failed.";
      setError(msg);
    } finally {
      setLoading(false);
      setGraphLoading(false);
      setUnderstandingLoading(false);
      setAutoPipelineRunning(false);
    }
  };

  const handleJumpToNode = (nodeId: string) => {
    setFocusedGraphNodeId(nodeId);
    setMainTab("graph");
    if (graphSectionRef.current) {
      graphSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

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

      try {
        const existingGraph = await getRepoGraph(response.repository.owner, response.repository.name);
        if (existingGraph) {
          setGraph(existingGraph);
        }
      } catch {}

      try {
        const existingUnderstanding = await getRepoUnderstanding(
          response.repository.owner,
          response.repository.name
        );
        if (existingUnderstanding) {
          setUnderstanding(existingUnderstanding);
        }
      } catch {}
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

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

  const handleResetRepo = () => {
    setRepo(null);
    setGraph(null);
    setUnderstanding(null);
    setRepoUrl("");
    setError(null);
  };

  return (
    <main className="flux-shell min-h-screen bg-[#0e0e0e] bg-akaru-grid relative flex flex-col selection:bg-[#e49366]/30 selection:text-[#ffffff]">
      {/* Ambient Akaru Terracotta Glow */}
      <div className="absolute inset-0 bg-akaru-radial pointer-events-none"></div>

      {/* Slow cloud drift keeps the landing surface alive without competing with the workflow. */}
      {!repo && (
        <div className="flux-cloud-field" aria-hidden="true">
          <span className="flux-cloud flux-cloud-one" />
          <span className="flux-cloud flux-cloud-two" />
          <span className="flux-cloud flux-cloud-three" />
          <span className="flux-cloud flux-cloud-four" />
          <span className="flux-cloud flux-cloud-five" />
          <span className="flux-cloud flux-cloud-six" />
          <span className="flux-cloud flux-cloud-seven" />
        </div>
      )}

      {/* Clean Minimalist Gallery Header */}
      <header className="flux-header border-b border-white/10 bg-[#0e0e0e]/80 backdrop-blur-xl px-6 py-4 sm:px-12 flex items-center justify-between sticky top-0 z-40">
        {/* Brand Mark with Terracotta Dot */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={handleResetRepo}>
          <div className="w-8 h-8 rounded-xl bg-[#e49366] text-[#0e0e0e] flex items-center justify-center font-extrabold shadow-md shadow-[#e49366]/25">
            <span className="text-sm tracking-tight">F</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-white">FLUX</span>
            <span className="text-[10px] font-code px-2 py-0.5 bg-[#e49366]/20 text-[#e49366] rounded-md font-bold">
              Studio
            </span>
          </div>
        </div>

        {/* Minimal Right Header Controls */}
        <div className="flex items-center gap-3 text-xs">
          {repo && (
            <button
              type="button"
              onClick={handleResetRepo}
              className="btn-white px-3.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer font-bold"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Switch Repo</span>
            </button>
          )}

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="btn-outline-white px-3.5 py-1.5 text-xs flex items-center gap-1.5"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">GitHub Source</span>
          </a>
        </div>
      </header>

      <div className="flux-progress-rail" aria-hidden="true">
        <span className="is-active" />
        <span />
        <span />
      </div>

      {/* VIEW A: Hero Centered Search Experience (Initial State) */}
      {!repo && (
        <div className="flux-intro flex-1 flex flex-col items-center justify-center px-4 py-20 max-w-4xl mx-auto w-full text-center relative z-10 space-y-10">
          {/* Hero Headlines */}
          <div className="space-y-5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#e49366]/15 border border-[#e49366]/40 text-[#e49366] text-xs font-bold shadow-lg shadow-[#e49366]/10">
              <CloudCog className="flux-cloud-mark w-5 h-5" strokeWidth={2.5} />
              <span>AST Architecture &amp; Autonomous Resolution</span>
            </div>
            <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight">
              Understand Any Codebase in{" "}
              <span className="text-[#e49366] underline decoration-[#e49366]/40 decoration-wavy underline-offset-8">
                Seconds
              </span>
            </h1>
            <p className="text-sm sm:text-base text-[#9e9e9e] leading-relaxed max-w-xl mx-auto">
              Explore complex repository architectures, trace AST dependency networks, and solve issues autonomously with grounded AI synthesis.
            </p>
          </div>

          {/* Centered Glowing Ingest Card */}
          <div className="flux-search-panel w-full max-w-2xl akaru-card p-5 sm:p-7 shadow-2xl space-y-5">
            <form onSubmit={handleIngest} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative flex items-center bg-[#0e0e0e] border border-white/20 rounded-2xl focus-within:border-[#e49366] focus-within:ring-2 focus-within:ring-[#e49366]/20 transition-all">
                <div className="pl-4 pr-2 text-[#e49366] flex items-center">
                  <FolderGit2 className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository or owner/repo"
                  disabled={loading || autoPipelineRunning}
                  className="flex-1 py-3.5 bg-transparent text-sm text-white placeholder-white/40 focus:outline-none font-code"
                  required
                />
              </div>

              {/* Bright Action Buttons */}
              <div className="flex gap-2.5 shrink-0">
                <button
                  type="submit"
                  disabled={loading || autoPipelineRunning || !repoUrl.trim()}
                  className="btn-white px-5 py-3.5 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {loading && !autoPipelineRunning ? "Ingesting..." : "Ingest"}
                </button>
                <button
                  type="button"
                  onClick={() => handleAutoPipeline()}
                  disabled={loading || autoPipelineRunning || !repoUrl.trim()}
                  className="btn-terracotta px-6 py-3.5 text-xs font-extrabold cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{autoPipelineRunning ? "Analyzing..." : "Full Analysis"}</span>
                </button>
              </div>
            </form>

            {/* Quick Starter Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1 text-xs">
              <span className="text-[#9e9e9e] text-xs font-semibold">Quick Samples:</span>
              {[
                { name: "pallets/flask" },
                { name: "fastapi/fastapi" },
                { name: "psf/requests" },
              ].map((sample) => (
                <button
                  key={sample.name}
                  type="button"
                  onClick={() => handleAutoPipeline(`https://github.com/${sample.name}`)}
                  disabled={loading || autoPipelineRunning}
                  className="px-3.5 py-1.5 bg-[#1a1a1a] hover:bg-[#242424] text-white hover:text-[#e49366] rounded-xl border border-white/10 hover:border-[#e49366] transition-all cursor-pointer font-code text-[11px]"
                >
                  {sample.name}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline Step Notification */}
          {autoPipelineStep && (
            <div className="w-full max-w-2xl p-4 bg-[#141414] border border-[#e49366]/40 rounded-2xl text-xs font-code text-white flex items-center justify-between shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-[#e49366] border-t-transparent rounded-full animate-spin"></div>
                <span>{autoPipelineStep}</span>
              </div>
              <span className="text-[10px] text-[#e49366] font-sans font-bold uppercase tracking-wider">
                Autonomous Pipeline
              </span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="w-full max-w-2xl p-4 bg-red-950/60 border border-red-800 rounded-2xl text-xs font-code text-red-300 text-left">
              Error: {error}
            </div>
          )}

          {/* 3 Capability Highlight Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-3xl pt-6 text-left">
            <div className="akaru-card-sm p-5 space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-white text-[#0e0e0e] flex items-center justify-center font-bold">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-white text-sm">AST Dependency Graph</h3>
              <p className="text-xs text-[#9e9e9e] leading-relaxed">
                Explore static code structure with continuous network energy pulses and callers tracking.
              </p>
            </div>

            <div className="akaru-card-sm p-5 space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#e49366] text-[#0e0e0e] flex items-center justify-center font-bold">
                <CloudCog className="w-4 h-4" strokeWidth={2.25} />
              </div>
              <h3 className="font-extrabold text-white text-sm">Grounded Intelligence</h3>
              <p className="text-xs text-[#9e9e9e] leading-relaxed">
                Plain-English architecture flows and feature maps synthesized from AST source files.
              </p>
            </div>

            <div className="akaru-card-sm p-5 space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-white text-[#0e0e0e] flex items-center justify-center font-bold">
                <CircleDot className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-white text-sm">Autonomous Fixes</h3>
              <p className="text-xs text-[#9e9e9e] leading-relaxed">
                Translate bug reports into verified multi-file code diffs and GitHub Pull Requests.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VIEW B: Active Workspace Dashboard */}
      {repo && !loading && (
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8 relative z-10">
          {/* Repository Summary Card */}
          <div className="akaru-card p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-extrabold text-white tracking-tight">
                    {repo.owner}/{repo.name}
                  </h2>
                  <span className="px-3 py-1 text-xs font-code bg-[#e49366] text-[#0e0e0e] rounded-md font-bold uppercase">
                    {repo.language || "Multi-language"}
                  </span>
                </div>
                {repo.description && (
                  <p className="text-xs text-[#9e9e9e] mt-1.5 max-w-2xl leading-relaxed">
                    {repo.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-outline-white px-4 py-2 text-xs flex items-center gap-1.5"
                >
                  <span>GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={handleBuildGraph}
                  disabled={graphLoading}
                  className="btn-white px-4 py-2 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {graphLoading ? "Parsing..." : graph ? "Rebuild Graph" : "Build Graph"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateUnderstanding}
                  disabled={understandingLoading}
                  className="btn-terracotta px-4 py-2 text-xs font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {understandingLoading
                    ? "Analyzing..."
                    : understanding
                    ? "Regenerate AI"
                    : "Analyze AI"}
                </button>
              </div>
            </div>

            {/* Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/10 text-xs">
              <div className="p-3 bg-[#0e0e0e] rounded-xl border border-white/10 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#9e9e9e] font-semibold">
                  <Star className="w-4 h-4 text-[#e49366]" />
                  Stars:
                </span>
                <strong className="text-white font-code text-sm">{repo.stars.toLocaleString()}</strong>
              </div>
              <div className="p-3 bg-[#0e0e0e] rounded-xl border border-white/10 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#9e9e9e] font-semibold">
                  <CircleDot className="w-4 h-4 text-[#e49366]" />
                  Open Issues:
                </span>
                <strong className="text-white font-code text-sm">{repo.open_issues_count.toLocaleString()}</strong>
              </div>
              <div className="p-3 bg-[#0e0e0e] rounded-xl border border-white/10 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#9e9e9e] font-semibold">
                  <FileCode className="w-4 h-4 text-white" />
                  Files Cloned:
                </span>
                <strong className="text-white font-code text-sm">{repo.file_count.toLocaleString()}</strong>
              </div>
              <div className="p-3 bg-[#0e0e0e] rounded-xl border border-white/10 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#9e9e9e] font-semibold">
                  <GitBranch className="w-4 h-4 text-[#e49366]" />
                  Branch:
                </span>
                <strong className="text-white font-code text-sm">{repo.default_branch || "main"}</strong>
              </div>
            </div>
          </div>

          {/* Workspace Navigation Tabs with Terracotta Underline */}
          <div className="flex border-b border-white/10 text-xs font-bold gap-3">
            <button
              type="button"
              onClick={() => setMainTab("graph")}
              className={`pb-3.5 px-4 transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
                mainTab === "graph"
                  ? "text-[#e49366] border-[#e49366]"
                  : "text-white/60 border-transparent hover:text-white"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Architecture Network</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab("understanding")}
              className={`pb-3.5 px-4 transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
                mainTab === "understanding"
                  ? "text-[#e49366] border-[#e49366]"
                  : "text-white/60 border-transparent hover:text-white"
              }`}
            >
                <CloudCog className="w-4 h-4" strokeWidth={2.25} />
              <span>Grounded Intelligence</span>
              {understanding && (
                <span className="w-2 h-2 rounded-full bg-[#e49366]"></span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMainTab("issues")}
              className={`pb-3.5 px-4 transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
                mainTab === "issues"
                  ? "text-[#e49366] border-[#e49366]"
                  : "text-white/60 border-transparent hover:text-white"
              }`}
            >
              <CircleDot className="w-4 h-4" />
              <span>Issue Resolution</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab("docs")}
              className={`pb-3.5 px-4 transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
                mainTab === "docs"
                  ? "text-[#e49366] border-[#e49366]"
                  : "text-white/60 border-transparent hover:text-white"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Documentation</span>
            </button>
          </div>

          {/* TAB 1: Graph Section */}
          {mainTab === "graph" && (
            <div ref={graphSectionRef} className="space-y-4">
              {graphError && (
                <div className="p-4 bg-red-950/60 border border-red-800 text-xs font-code text-red-300 rounded-2xl">
                  Graph Error: {graphError}
                </div>
              )}

              {graph ? (
                <ObsidianGraphCanvas
                  owner={repo.owner}
                  repo={repo.name}
                  graph={graph}
                  focusedNodeId={focusedGraphNodeId}
                  onClearFocus={() => setFocusedGraphNodeId(null)}
                />
              ) : (
                <div className="p-16 text-center akaru-card space-y-4 text-xs text-[#9e9e9e]">
                  <p>Dependency network not computed yet.</p>
                  <button
                    type="button"
                    onClick={handleBuildGraph}
                    disabled={graphLoading}
                    className="btn-terracotta px-5 py-2.5 text-xs font-bold cursor-pointer"
                  >
                    {graphLoading ? "Parsing AST..." : "Build Dependency Network"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Grounded Intelligence */}
          {mainTab === "understanding" && (
            <div className="space-y-4">
              {understandingLoading && (
                <div className="p-12 text-center text-xs text-white akaru-card space-y-3">
                  <div className="w-6 h-6 border-2 border-[#e49366] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p>Synthesizing grounded architecture intelligence via Gemini...</p>
                </div>
              )}

              {understandingError && (
                <div className="p-4 bg-red-950/60 border border-red-800 text-xs font-code text-red-300 rounded-2xl">
                  Understanding Error: {understandingError}
                </div>
              )}

              {understanding && !understandingLoading && (
                <div className="akaru-card p-6 sm:p-8 space-y-6 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-5">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                      Architectural Intelligence Base
                    </span>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setUnderstandingTab("overview")}
                        className={`px-4 py-2 rounded-xl transition-all cursor-pointer font-bold ${
                          understandingTab === "overview"
                            ? "bg-[#e49366] text-[#0e0e0e]"
                            : "btn-outline-white"
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnderstandingTab("architecture")}
                        className={`px-4 py-2 rounded-xl transition-all cursor-pointer font-bold ${
                          understandingTab === "architecture"
                            ? "bg-[#e49366] text-[#0e0e0e]"
                            : "btn-outline-white"
                        }`}
                      >
                        Component Flows ({understanding.flows?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnderstandingTab("features")}
                        className={`px-4 py-2 rounded-xl transition-all cursor-pointer font-bold ${
                          understandingTab === "features"
                            ? "bg-[#e49366] text-[#0e0e0e]"
                            : "btn-outline-white"
                        }`}
                      >
                        Feature Map ({understanding.feature_map.length})
                      </button>
                    </div>
                  </div>

                  {/* Sub-tab 1: Overview */}
                  {understandingTab === "overview" && (
                    <div className="text-xs text-white leading-relaxed whitespace-pre-wrap bg-[#0e0e0e] p-6 rounded-2xl border border-white/10">
                      {understanding.overview}
                    </div>
                  )}

                  {/* Sub-tab 2: Architecture Flows */}
                  {understandingTab === "architecture" && (
                    <div className="space-y-4 text-xs">
                      <div className="text-white leading-relaxed whitespace-pre-wrap bg-[#0e0e0e] p-6 rounded-2xl border border-white/10">
                        {understanding.architecture_summary}
                      </div>
                      {understanding.flows && understanding.flows.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                          {understanding.flows.map((flow, i) => (
                            <div
                              key={i}
                              className="p-5 bg-[#141414] border border-white/10 rounded-2xl space-y-3 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-extrabold text-white text-sm">{flow.component}</span>
                                <button
                                  type="button"
                                  onClick={() => handleJumpToNode(flow.central_file)}
                                  className="text-[#e49366] font-code underline cursor-pointer text-xs flex items-center gap-1 font-bold"
                                >
                                  <span>{flow.central_file}</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-[#9e9e9e] text-xs leading-relaxed">{flow.role}</p>
                              {flow.connections && flow.connections.length > 0 && (
                                <div className="text-[10px] text-[#9e9e9e] font-code flex flex-wrap gap-1.5 pt-2.5 border-t border-white/10">
                                  <span>Interacts:</span>
                                  {flow.connections.map((c, cIdx) => (
                                    <button
                                      key={cIdx}
                                      type="button"
                                      onClick={() => handleJumpToNode(c)}
                                      className="text-white hover:text-[#e49366] underline cursor-pointer"
                                    >
                                      {c}
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

                  {/* Sub-tab 3: Feature Map */}
                  {understandingTab === "features" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      {understanding.feature_map.map((feat, idx) => (
                        <div
                          key={idx}
                          className="p-5 bg-[#141414] border border-white/10 rounded-2xl space-y-2.5"
                        >
                          <div className="font-extrabold text-white text-sm">{feat.name}</div>
                          <p className="text-[#9e9e9e] text-xs leading-relaxed">{feat.description}</p>
                          {feat.files && feat.files.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-2 font-code text-[11px]">
                              {feat.files.map((file, fIdx) => (
                                <button
                                  key={fIdx}
                                  type="button"
                                  onClick={() => handleJumpToNode(file)}
                                  className="px-3 py-1 bg-[#0e0e0e] text-white hover:text-[#e49366] border border-white/10 hover:border-[#e49366] rounded-xl cursor-pointer transition-all font-bold"
                                >
                                  {file} &rarr;
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
            </div>
          )}

          {/* TAB 3: Issue Explorer */}
          {mainTab === "issues" && (
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
          )}

          {/* TAB 4: Documentation */}
          {mainTab === "docs" && (
            <div className="akaru-card p-6 sm:p-8 space-y-5 shadow-2xl text-xs">
              <div className="flex border-b border-white/10 gap-3">
                <button
                  type="button"
                  onClick={() => setDocsTab("readme")}
                  className={`pb-3.5 px-4 font-bold transition-all cursor-pointer border-b-2 ${
                    docsTab === "readme"
                      ? "text-[#e49366] border-[#e49366]"
                      : "text-white/60 border-transparent hover:text-white"
                  }`}
                >
                  README {repo.has_readme ? "(Present)" : "(None)"}
                </button>
                <button
                  type="button"
                  onClick={() => setDocsTab("contributing")}
                  className={`pb-3.5 px-4 font-bold transition-all cursor-pointer border-b-2 ${
                    docsTab === "contributing"
                      ? "text-[#e49366] border-[#e49366]"
                      : "text-white/60 border-transparent hover:text-white"
                  }`}
                >
                  CONTRIBUTING {repo.has_contributing ? "(Present)" : "(None)"}
                </button>
              </div>

              <div className="bg-[#0e0e0e] p-6 rounded-2xl border border-white/10 max-h-96 overflow-y-auto text-white font-code text-xs whitespace-pre-wrap leading-relaxed">
                {docsTab === "readme" ? (
                  repo.readme_content || <span className="text-[#9e9e9e]">No README file found.</span>
                ) : (
                  repo.contributing_content || (
                    <span className="text-[#9e9e9e]">No CONTRIBUTING file found.</span>
                  )
                )}
              </div>
            </div>
          )}

          {/* Agent Handoff Modal */}
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
        </div>
      )}
    </main>
  );
}
