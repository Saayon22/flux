"use client";

import React, { useState, useRef, useEffect } from "react";
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

  // System Status State
  const [systemStatus, setSystemStatus] = useState<AgentStatusResponse | null>(null);
  const [autoPipelineRunning, setAutoPipelineRunning] = useState(false);
  const [autoPipelineStep, setAutoPipelineStep] = useState<string>("");

  useEffect(() => {
    getAgentStatus()
      .then((data) => setSystemStatus(data))
      .catch(() => {});
  }, []);

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
      setAutoPipelineStep("1/3 Ingesting repository...");
      const ingestRes = await ingestRepository(urlToRun);
      setRepo(ingestRes.repository);
      setActiveTab("readme");

      setAutoPipelineStep("2/3 Parsing AST & building dependency graph...");
      setGraphLoading(true);
      const graphRes = await buildRepoGraph(ingestRes.repository.owner, ingestRes.repository.name);
      setGraph(graphRes);
      setGraphLoading(false);

      setAutoPipelineStep("3/3 Generating repository understanding with Gemini...");
      setUnderstandingLoading(true);
      const underRes = await generateRepoUnderstanding(ingestRes.repository.owner, ingestRes.repository.name);
      setUnderstanding(underRes);
      setUnderstandingLoading(false);

      setAutoPipelineStep("Analysis complete.");
      setTimeout(() => setAutoPipelineStep(""), 3000);
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
      setActiveTab("readme");

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

  return (
    <main className="min-h-screen bg-black text-neutral-200 px-4 py-6 sm:px-8 font-sans max-w-6xl mx-auto space-y-6">
      {/* Header & Status */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <h1 className="text-xl font-bold font-mono tracking-tight text-white">flux</h1>
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-neutral-400">
          <span>Engine: <strong className="text-neutral-200">{systemStatus?.status === "online" ? "Active" : "Ready"}</strong></span>
          <span>Model: <strong className="text-neutral-200">{systemStatus?.model || "Configured"}</strong></span>
          <span>
            GitHub Rate Limit:{" "}
            <strong className="text-neutral-200">
              {systemStatus?.github?.remaining ?? 5000}/{systemStatus?.github?.limit ?? 5000}
            </strong>
          </span>
        </div>
      </header>

      {/* Input Form */}
      <form onSubmit={handleIngest} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/owner/repository"
          disabled={loading || autoPipelineRunning}
          className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          required
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || autoPipelineRunning || !repoUrl.trim()}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-medium rounded border border-neutral-700 cursor-pointer"
          >
            {loading && !autoPipelineRunning ? "Ingesting..." : "Ingest"}
          </button>
          <button
            type="button"
            onClick={() => handleAutoPipeline()}
            disabled={loading || autoPipelineRunning || !repoUrl.trim()}
            className="px-4 py-2 bg-neutral-200 hover:bg-white disabled:opacity-50 text-neutral-900 text-xs font-semibold rounded cursor-pointer"
          >
            {autoPipelineRunning ? "Analyzing..." : "Full Analysis"}
          </button>
        </div>
      </form>

      {/* Pipeline Progress Step */}
      {autoPipelineStep && (
        <div className="p-3 bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-300">
          {autoPipelineStep}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 text-xs font-mono text-red-300">
          Error: {error}
        </div>
      )}

      {/* Ingested Repository Content */}
      {repo && !loading && (
        <div className="space-y-6">
          {/* Metadata Bar */}
          <div className="border border-neutral-800 bg-neutral-950 p-4 rounded space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold font-mono text-white">
                  {repo.owner}/{repo.name}
                </h2>
                {repo.description && <p className="text-xs text-neutral-400 mt-0.5">{repo.description}</p>}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-400 hover:underline mr-2"
                >
                  GitHub &rarr;
                </a>
                <button
                  type="button"
                  onClick={handleBuildGraph}
                  disabled={graphLoading}
                  className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-neutral-200 text-xs rounded border border-neutral-700 cursor-pointer"
                >
                  {graphLoading ? "Parsing AST..." : graph ? "Rebuild Graph" : "Build Graph"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateUnderstanding}
                  disabled={understandingLoading}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs font-medium rounded border border-neutral-600 cursor-pointer"
                >
                  {understandingLoading ? "Analyzing..." : understanding ? "Regenerate Understanding" : "Generate Understanding"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-2 border-t border-neutral-800 text-neutral-400">
              <div>Language: <span className="text-neutral-200 font-semibold">{repo.language || "Unknown"}</span></div>
              <div>Stars: <span className="text-neutral-200 font-semibold">{repo.stars.toLocaleString()}</span></div>
              <div>Open Issues: <span className="text-neutral-200 font-semibold">{repo.open_issues_count.toLocaleString()}</span></div>
              <div>Files Cloned: <span className="text-neutral-200 font-semibold">{repo.file_count.toLocaleString()}</span></div>
            </div>

            <div className="text-[11px] font-mono text-neutral-500 pt-1">
              Workspace: <span className="text-neutral-300">{repo.clone_path}</span>
            </div>
          </div>

          {/* Repository Understanding */}
          {understandingLoading && (
            <div className="p-4 bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-400">
              Generating grounded repository understanding...
            </div>
          )}

          {understandingError && (
            <div className="p-3 bg-red-950/60 border border-red-800 text-xs font-mono text-red-300">
              Understanding Error: {understandingError}
            </div>
          )}

          {understanding && !understandingLoading && (
            <div className="border border-neutral-800 bg-neutral-950 p-4 rounded space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-neutral-300">
                  Repository Understanding
                </span>
                <div className="flex gap-1 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setUnderstandingTab("overview")}
                    className={`px-2.5 py-1 rounded cursor-pointer ${
                      understandingTab === "overview" ? "bg-neutral-800 text-white font-bold" : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnderstandingTab("architecture")}
                    className={`px-2.5 py-1 rounded cursor-pointer ${
                      understandingTab === "architecture" ? "bg-neutral-800 text-white font-bold" : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    Architecture
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnderstandingTab("features")}
                    className={`px-2.5 py-1 rounded cursor-pointer ${
                      understandingTab === "features" ? "bg-neutral-800 text-white font-bold" : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    Features ({understanding.feature_map.length})
                  </button>
                </div>
              </div>

              {understandingTab === "overview" && (
                <div className="text-xs text-neutral-300 leading-relaxed font-mono whitespace-pre-wrap">
                  {understanding.overview}
                </div>
              )}

              {understandingTab === "architecture" && (
                <div className="space-y-3 text-xs">
                  <div className="text-neutral-300 leading-relaxed font-mono whitespace-pre-wrap">
                    {understanding.architecture_summary}
                  </div>
                  {understanding.flows && understanding.flows.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      {understanding.flows.map((flow, i) => (
                        <div key={i} className="p-3 bg-neutral-900 border border-neutral-800 rounded text-xs space-y-1">
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-bold text-neutral-200">{flow.component}</span>
                            <button
                              type="button"
                              onClick={() => handleJumpToNode(flow.central_file)}
                              className="text-neutral-400 hover:text-white underline cursor-pointer text-[11px]"
                            >
                              {flow.central_file} &rarr;
                            </button>
                          </div>
                          <p className="text-neutral-400 text-[11px]">{flow.role}</p>
                          {flow.connections && flow.connections.length > 0 && (
                            <div className="text-[10px] text-neutral-500 font-mono flex flex-wrap gap-1 pt-1">
                              <span>Interacts with:</span>
                              {flow.connections.map((c, cIdx) => (
                                <button
                                  key={cIdx}
                                  type="button"
                                  onClick={() => handleJumpToNode(c)}
                                  className="text-neutral-300 hover:underline cursor-pointer"
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

              {understandingTab === "features" && (
                <div className="space-y-2 text-xs">
                  {understanding.feature_map.map((feat, idx) => (
                    <div key={idx} className="p-3 bg-neutral-900 border border-neutral-800 rounded space-y-1">
                      <div className="font-bold font-mono text-neutral-200">{feat.name}</div>
                      <p className="text-neutral-400 text-[11px]">{feat.description}</p>
                      {feat.files && feat.files.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 font-mono text-[10px]">
                          {feat.files.map((file, fIdx) => (
                            <button
                              key={fIdx}
                              type="button"
                              onClick={() => handleJumpToNode(file)}
                              className="px-1.5 py-0.5 bg-neutral-950 text-neutral-300 hover:text-white border border-neutral-800 rounded cursor-pointer"
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

          {/* Graph Section */}
          {graphError && (
            <div className="p-3 bg-red-950/60 border border-red-800 text-xs font-mono text-red-300">
              Graph Error: {graphError}
            </div>
          )}

          {graph && (
            <div ref={graphSectionRef} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-neutral-300">
                  Dependency Graph Explorer ({graph.metrics.total_nodes} nodes, {graph.metrics.total_edges} edges)
                </h3>
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

          {/* Issues Section */}
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

          {/* Documentation Section */}
          <div className="border border-neutral-800 bg-neutral-950 p-4 rounded space-y-3">
            <div className="flex border-b border-neutral-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveTab("readme")}
                className={`pb-2 px-3 font-medium cursor-pointer ${
                  activeTab === "readme" ? "text-white border-b-2 border-white font-bold" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                README {repo.has_readme ? "✓" : "(None)"}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("contributing")}
                className={`pb-2 px-3 font-medium cursor-pointer ${
                  activeTab === "contributing" ? "text-white border-b-2 border-white font-bold" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                CONTRIBUTING {repo.has_contributing ? "✓" : "(None)"}
              </button>
            </div>

            <div className="bg-neutral-900 p-3 rounded border border-neutral-800 max-h-64 overflow-y-auto font-mono text-xs text-neutral-300 whitespace-pre-wrap">
              {activeTab === "readme" ? (
                repo.readme_content || <span className="text-neutral-500">No README file found.</span>
              ) : (
                repo.contributing_content || <span className="text-neutral-500">No CONTRIBUTING file found.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
