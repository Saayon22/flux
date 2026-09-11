// Main application page for FLUX codebase architecture and synthesis.
"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
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

// Main component managing repository ingestion, architecture graph, and issue explorer.
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

  // Executes autonomous multi-phase ingestion, graph construction, and AI synthesis pipeline.
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

  // Focuses on target node in architecture graph and scrolls canvas into viewport.
  const handleJumpToNode = (nodeId: string) => {
    setFocusedGraphNodeId(nodeId);
    setMainTab("graph");
    if (graphSectionRef.current) {
      graphSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Ingests repository metadata and loads existing graph and understanding if available.
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

  // Builds and models dependency graph from parsed AST structure.
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

  // Synthesizes architectural summaries, component flows, and feature maps via Gemini.
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

  // Resets active repository state and returns view to initial ingestion screen.
  const handleResetRepo = () => {
    setRepo(null);
    setGraph(null);
    setUnderstanding(null);
    setRepoUrl("");
    setError(null);
  };

  return (
    <main className="flux-shell min-h-screen bg-[#f7f4ec] bg-akaru-grid relative flex flex-col selection:bg-[#df7d4c]/30 selection:text-[#171817]">
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
      <header className="flux-header border-b border-[rgba(23,24,23,0.1)] bg-[rgba(247,244,236,0.85)] backdrop-blur-xl px-6 py-4 sm:px-12 flex items-center justify-between sticky top-0 z-40">
        {/* Brand Mark with Flowing Wave Logo */}
        <div className="flex items-center gap-3 cursor-pointer group" onClick={handleResetRepo}>
          <div className="flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="FLUX Logo"
              width={74}
              height={32}
              priority
              className="h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-[0_2px_12px_rgba(228,147,102,0.3)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-[#171817] group-hover:text-[#df7d4c] transition-colors">FLUX</span>
            <span className="text-[10px] font-code px-2 py-0.5 bg-[#df7d4c]/15 text-[#df7d4c] rounded-md font-bold">
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
          <div className="space-y-4 max-w-2xl">
            <h1 className="text-4xl sm:text-6xl font-extrabold text-[#171817] tracking-tight leading-tight">
              Understand Any Codebase in{" "}
              <span className="text-[#df7d4c] underline decoration-[#df7d4c]/40 decoration-wavy underline-offset-8">
                Seconds
              </span>
            </h1>
            <p className="text-sm sm:text-base text-[#6b6963] leading-relaxed max-w-xl mx-auto">
              Explore complex repository architectures, trace AST dependency networks, and solve issues autonomously with grounded AI synthesis.
            </p>
          </div>

          {/* Centered Glowing Ingest Card */}
          <div className="flux-search-panel w-full max-w-2xl akaru-card p-5 sm:p-7 shadow-2xl space-y-5">
            <form onSubmit={handleIngest} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative flex items-center bg-[#fffefa] border border-[rgba(23,24,23,0.15)] rounded-2xl focus-within:border-[#df7d4c] focus-within:ring-2 focus-within:ring-[#df7d4c]/20 shadow-xs transition-all">
                <div className="pl-4 pr-2 text-[#df7d4c] flex items-center">
                  <FolderGit2 className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository or owner/repo"
                  aria-label="GitHub repository URL"
                  disabled={loading || autoPipelineRunning}
                  className="flex-1 py-3.5 bg-transparent text-sm text-[#171817] placeholder-[rgba(23,24,23,0.4)] focus:outline-none font-code disabled:opacity-50"
                  required
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 shrink-0">
                <button
                  type="submit"
                  disabled={loading || autoPipelineRunning || !repoUrl.trim()}
                  className="btn-white px-5 py-3.5 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && !autoPipelineRunning ? "Ingesting..." : "Ingest"}
                </button>
                <button
                  type="button"
                  onClick={() => handleAutoPipeline()}
                  disabled={loading || autoPipelineRunning || !repoUrl.trim()}
                  className="btn-terracotta px-6 py-3.5 text-xs font-extrabold cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{autoPipelineRunning ? "Analyzing..." : "Full Analysis"}</span>
                </button>
              </div>
            </form>

            {/* Quick Starter Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1 text-xs">
              <span className="text-[#6b6963] text-xs font-semibold">Quick Samples:</span>
              {[
                { name: "pallets/flask" },
                { name: "fastapi/fastapi" },
                { name: "psf/requests" },
              ].map((sample) => (
                <button
                  key={sample.name}
                  type="button"
                  aria-label={`Load sample repository ${sample.name}`}
                  onClick={() => handleAutoPipeline(`https://github.com/${sample.name}`)}
                  disabled={loading || autoPipelineRunning}
                  className="px-3.5 py-1.5 bg-[#fffefa] hover:bg-[#f4efe6] text-[#171817] hover:text-[#df7d4c] rounded-xl border border-[rgba(23,24,23,0.12)] hover:border-[#df7d4c] transition-all cursor-pointer font-code text-[11px] shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sample.name}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline Step Notification */}
          {autoPipelineStep && (
            <div className="w-full max-w-2xl p-4 bg-[#fffefa] border border-[#df7d4c]/40 rounded-2xl text-xs font-code text-[#171817] flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-[#df7d4c] border-t-transparent rounded-full animate-spin"></div>
                <span>{autoPipelineStep}</span>
              </div>
              <span className="text-[10px] text-[#df7d4c] font-sans font-bold uppercase tracking-wider">
                Autonomous Pipeline
              </span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="w-full max-w-2xl p-4 alert-terracotta-error rounded-2xl text-xs font-code text-left">
              Error: {error}
            </div>
          )}

          {/* 3 Capability Highlight Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-3xl pt-6 text-left">
            <div className="akaru-card-sm p-5 space-y-2.5 bg-[#fffefa] border border-[rgba(23,24,23,0.12)] rounded-2xl shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-[#df7d4c]/15 text-[#df7d4c] flex items-center justify-center font-bold">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-[#171817] text-sm">AST Dependency Graph</h3>
              <p className="text-xs text-[#6b6963] leading-relaxed">
                Explore static code structure with continuous network energy pulses and callers tracking.
              </p>
            </div>

            <div className="akaru-card-sm p-5 space-y-2.5 bg-[#fffefa] border border-[rgba(23,24,23,0.12)] rounded-2xl shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-[#df7d4c]/15 text-[#df7d4c] flex items-center justify-center font-bold">
                <CloudCog className="w-4 h-4" strokeWidth={2.25} />
              </div>
              <h3 className="font-extrabold text-[#171817] text-sm">Grounded Intelligence</h3>
              <p className="text-xs text-[#6b6963] leading-relaxed">
                Plain-English architecture flows and feature maps synthesized from AST source files.
              </p>
            </div>

            <div className="akaru-card-sm p-5 space-y-2.5 bg-[#fffefa] border border-[rgba(23,24,23,0.12)] rounded-2xl shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-[#df7d4c]/15 text-[#df7d4c] flex items-center justify-center font-bold">
                <CircleDot className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-[#171817] text-sm">Autonomous Fixes</h3>
              <p className="text-xs text-[#6b6963] leading-relaxed">
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
                  <h2 className="text-2xl font-extrabold text-[#171817] tracking-tight">
                    {repo.owner}/{repo.name}
                  </h2>
                  <span className="px-3 py-1 text-xs font-code bg-[#df7d4c]/15 text-[#df7d4c] border border-[#df7d4c]/30 rounded-md font-bold uppercase">
                    {repo.language || "Multi-language"}
                  </span>
                </div>
                {repo.description && (
                  <p className="text-xs text-[#6b6963] mt-1.5 max-w-2xl leading-relaxed">
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
                  className="btn-white px-4 py-2 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {graphLoading ? "Parsing..." : graph ? "Rebuild Graph" : "Build Graph"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateUnderstanding}
                  disabled={understandingLoading}
                  className="btn-terracotta px-4 py-2 text-xs font-extrabold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[rgba(23,24,23,0.1)] text-xs">
              <div className="p-3 bg-[#fffefa] rounded-xl border border-[rgba(23,24,23,0.1)] flex items-center justify-between shadow-xs">
                <span className="flex items-center gap-2 text-[#6b6963] font-semibold">
                  <Star className="w-4 h-4 text-[#df7d4c]" />
                  Stars:
                </span>
                <strong className="text-[#171817] font-code text-sm">{repo.stars.toLocaleString()}</strong>
              </div>
              <div className="p-3 bg-[#fffefa] rounded-xl border border-[rgba(23,24,23,0.1)] flex items-center justify-between shadow-xs">
                <span className="flex items-center gap-2 text-[#6b6963] font-semibold">
                  <CircleDot className="w-4 h-4 text-[#df7d4c]" />
                  Open Issues:
                </span>
                <strong className="text-[#171817] font-code text-sm">{repo.open_issues_count.toLocaleString()}</strong>
              </div>
              <div className="p-3 bg-[#fffefa] rounded-xl border border-[rgba(23,24,23,0.1)] flex items-center justify-between shadow-xs">
                <span className="flex items-center gap-2 text-[#6b6963] font-semibold">
                  <FileCode className="w-4 h-4 text-[#171817]" />
                  Files Cloned:
                </span>
                <strong className="text-[#171817] font-code text-sm">{repo.file_count.toLocaleString()}</strong>
              </div>
              <div className="p-3 bg-[#fffefa] rounded-xl border border-[rgba(23,24,23,0.1)] flex items-center justify-between shadow-xs">
                <span className="flex items-center gap-2 text-[#6b6963] font-semibold">
                  <GitBranch className="w-4 h-4 text-[#df7d4c]" />
                  Branch:
                </span>
                <strong className="text-[#171817] font-code text-sm">{repo.default_branch || "main"}</strong>
              </div>
            </div>
          </div>

          {/* Workspace Navigation Tabs with Terracotta Underline */}
          <div role="tablist" aria-label="Workspace Sections" className="flex border-b border-[rgba(23,24,23,0.12)] text-xs font-bold gap-3">
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "graph"}
              onClick={() => setMainTab("graph")}
              className={`pb-3.5 px-4 transition-all cursor-pointer flex items-center gap-2 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                mainTab === "graph"
                  ? "text-[#df7d4c] border-[#df7d4c]"
                  : "text-[#6b6963] border-transparent hover:text-[#171817]"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Architecture Network</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "understanding"}
              onClick={() => setMainTab("understanding")}
              className={`pb-3.5 px-4 transition-all cursor-pointer flex items-center gap-2 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                mainTab === "understanding"
                  ? "text-[#df7d4c] border-[#df7d4c]"
                  : "text-[#6b6963] border-transparent hover:text-[#171817]"
              }`}
            >
              <CloudCog className="w-4 h-4" strokeWidth={2.25} />
              <span>Grounded Intelligence</span>
              {understanding && (
                <span className="w-2 h-2 rounded-full bg-[#df7d4c]"></span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "issues"}
              onClick={() => setMainTab("issues")}
              className={`pb-3.5 px-4 transition-all cursor-pointer flex items-center gap-2 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                mainTab === "issues"
                  ? "text-[#df7d4c] border-[#df7d4c]"
                  : "text-[#6b6963] border-transparent hover:text-[#171817]"
              }`}
            >
              <CircleDot className="w-4 h-4" />
              <span>Issue Resolution</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "docs"}
              onClick={() => setMainTab("docs")}
              className={`pb-3.5 px-4 transition-all cursor-pointer flex items-center gap-2 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                mainTab === "docs"
                  ? "text-[#df7d4c] border-[#df7d4c]"
                  : "text-[#6b6963] border-transparent hover:text-[#171817]"
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
                <div className="p-4 alert-terracotta-error text-xs font-code rounded-2xl">
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
                <div className="p-16 text-center akaru-card space-y-4 text-xs text-[#6b6963]">
                  <p>Dependency network not computed yet.</p>
                  <button
                    type="button"
                    onClick={handleBuildGraph}
                    disabled={graphLoading}
                    className="btn-terracotta px-5 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-50"
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
                <div className="p-12 text-center text-xs text-[#171817] akaru-card space-y-3">
                  <div className="w-6 h-6 border-2 border-[#df7d4c] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p>Synthesizing grounded architecture intelligence via Gemini...</p>
                </div>
              )}

              {understandingError && (
                <div className="p-4 alert-terracotta-error text-xs font-code rounded-2xl">
                  Understanding Error: {understandingError}
                </div>
              )}

              {understanding && !understandingLoading && (
                <div className="akaru-card p-6 sm:p-8 space-y-6 shadow-2xl">
                  <div className="flex flex-wrap items-center justify-between border-b border-[rgba(23,24,23,0.1)] pb-5 gap-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#171817]">
                      Architectural Intelligence Base
                    </span>
                    <div role="tablist" aria-label="Understanding Categories" className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={understandingTab === "overview"}
                        onClick={() => setUnderstandingTab("overview")}
                        className={`px-4 py-2 rounded-xl transition-all cursor-pointer font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                          understandingTab === "overview"
                            ? "bg-[#df7d4c] text-[#fffdf8] shadow-xs"
                            : "bg-[#fffefa] text-[#171817] border border-[rgba(23,24,23,0.12)] hover:border-[#df7d4c]"
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={understandingTab === "architecture"}
                        onClick={() => setUnderstandingTab("architecture")}
                        className={`px-4 py-2 rounded-xl transition-all cursor-pointer font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                          understandingTab === "architecture"
                            ? "bg-[#df7d4c] text-[#fffdf8] shadow-xs"
                            : "bg-[#fffefa] text-[#171817] border border-[rgba(23,24,23,0.12)] hover:border-[#df7d4c]"
                        }`}
                      >
                        Component Flows ({understanding.flows?.length || 0})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={understandingTab === "features"}
                        onClick={() => setUnderstandingTab("features")}
                        className={`px-4 py-2 rounded-xl transition-all cursor-pointer font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                          understandingTab === "features"
                            ? "bg-[#df7d4c] text-[#fffdf8] shadow-xs"
                            : "bg-[#fffefa] text-[#171817] border border-[rgba(23,24,23,0.12)] hover:border-[#df7d4c]"
                        }`}
                      >
                        Feature Map ({understanding.feature_map.length})
                      </button>
                    </div>
                  </div>

                  {/* Sub-tab 1: Overview */}
                  {understandingTab === "overview" && (
                    <div className="text-xs text-[#171817] leading-relaxed whitespace-pre-wrap bg-[#fffefa] p-6 rounded-2xl border border-[rgba(23,24,23,0.12)] shadow-xs">
                      {understanding.overview}
                    </div>
                  )}

                  {/* Sub-tab 2: Architecture Flows */}
                  {understandingTab === "architecture" && (
                    <div className="space-y-4 text-xs">
                      <div className="text-[#171817] leading-relaxed whitespace-pre-wrap bg-[#fffefa] p-6 rounded-2xl border border-[rgba(23,24,23,0.12)] shadow-xs">
                        {understanding.architecture_summary}
                      </div>
                      {understanding.flows && understanding.flows.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                          {understanding.flows.map((flow, i) => (
                            <div
                              key={i}
                              className="p-5 bg-[#fffefa] border border-[rgba(23,24,23,0.12)] rounded-2xl space-y-3 text-xs shadow-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-extrabold text-[#171817] text-sm">{flow.component}</span>
                                <button
                                  type="button"
                                  onClick={() => handleJumpToNode(flow.central_file)}
                                  className="text-[#df7d4c] font-code underline cursor-pointer text-xs flex items-center gap-1 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] rounded-md"
                                >
                                  <span>{flow.central_file}</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-[#6b6963] text-xs leading-relaxed">{flow.role}</p>
                              {flow.connections && flow.connections.length > 0 && (
                                <div className="text-[10px] text-[#6b6963] font-code flex flex-wrap gap-1.5 pt-2.5 border-t border-[rgba(23,24,23,0.08)]">
                                  <span>Interacts:</span>
                                  {flow.connections.map((c, cIdx) => (
                                    <button
                                      key={cIdx}
                                      type="button"
                                      onClick={() => handleJumpToNode(c)}
                                      className="text-[#171817] hover:text-[#df7d4c] underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] rounded-xs"
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
                          className="p-5 bg-[#fffefa] border border-[rgba(23,24,23,0.12)] rounded-2xl space-y-2.5 shadow-xs"
                        >
                          <div className="font-extrabold text-[#171817] text-sm">{feat.name}</div>
                          <p className="text-[#6b6963] text-xs leading-relaxed">{feat.description}</p>
                          {feat.files && feat.files.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-2 font-code text-[11px]">
                              {feat.files.map((file, fIdx) => (
                                <button
                                  key={fIdx}
                                  type="button"
                                  onClick={() => handleJumpToNode(file)}
                                  className="px-3 py-1 bg-[#f4efe6] text-[#171817] hover:text-[#df7d4c] border border-[rgba(23,24,23,0.1)] hover:border-[#df7d4c] rounded-xl cursor-pointer transition-all font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c]"
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
              <div role="tablist" aria-label="Documentation Files" className="flex border-b border-[rgba(23,24,23,0.1)] gap-3">
                <button
                  type="button"
                  role="tab"
                  aria-selected={docsTab === "readme"}
                  onClick={() => setDocsTab("readme")}
                  className={`pb-3.5 px-4 font-bold transition-all cursor-pointer border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                    docsTab === "readme"
                      ? "text-[#df7d4c] border-[#df7d4c]"
                      : "text-[#6b6963] border-transparent hover:text-[#171817]"
                  }`}
                >
                  README {repo.has_readme ? "(Present)" : "(None)"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={docsTab === "contributing"}
                  onClick={() => setDocsTab("contributing")}
                  className={`pb-3.5 px-4 font-bold transition-all cursor-pointer border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#df7d4c] ${
                    docsTab === "contributing"
                      ? "text-[#df7d4c] border-[#df7d4c]"
                      : "text-[#6b6963] border-transparent hover:text-[#171817]"
                  }`}
                >
                  CONTRIBUTING {repo.has_contributing ? "(Present)" : "(None)"}
                </button>
              </div>

              <div className="bg-[#fffefa] p-6 rounded-2xl border border-[rgba(23,24,23,0.12)] max-h-96 overflow-y-auto text-[#171817] font-code text-xs whitespace-pre-wrap leading-relaxed shadow-xs">
                {docsTab === "readme" ? (
                  repo.readme_content || <span className="text-[#6b6963]">No README file found.</span>
                ) : (
                  repo.contributing_content || (
                    <span className="text-[#6b6963]">No CONTRIBUTING file found.</span>
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
