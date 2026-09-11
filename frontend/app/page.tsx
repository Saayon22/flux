"use client";

/**
 * Main Page for flux (Phase 1: Repository Ingestion).
 * Provides a clean, focused UI to accept a GitHub repository URL,
 * initiate local shallow cloning, and view repository metadata and docs.
 */

import React, { useState } from "react";
import { ingestRepository, RepoMetadata } from "./lib/api";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState<RepoMetadata | null>(null);
  const [activeTab, setActiveTab] = useState<"readme" | "contributing">("readme");

  /**
   * Handles submission of the GitHub URL.
   * Calls the backend ingestion endpoint and updates UI state.
   */
  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await ingestRepository(repoUrl.trim());
      setRepo(response.repository);
      setActiveTab("readme");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-4xl space-y-8">
        
        {/* Header Section */}
        <div className="text-center space-y-2">
          <div className="inline-block px-3 py-1 text-xs font-semibold tracking-wider text-emerald-400 uppercase bg-emerald-950/60 border border-emerald-800/40 rounded-full">
            Phase 1: Repository Ingestion
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            flux
          </h1>
          <p className="text-sm sm:text-base text-neutral-400 max-w-xl mx-auto">
            Enter a public GitHub repository URL to clone it into local workspaces and inspect documentation.
          </p>
        </div>

        {/* Input Form Section */}
        <form onSubmit={handleIngest} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              required
            />
            <button
              type="submit"
              disabled={loading || !repoUrl.trim()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-medium rounded-lg text-sm transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Cloning...</span>
                </>
              ) : (
                "Ingest Repository"
              )}
            </button>
          </div>
        </form>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-red-950/50 border border-red-800/60 rounded-lg text-sm text-red-200">
            <span className="font-semibold text-red-400">Ingestion Error: </span>
            {error}
          </div>
        )}

        {/* Loading Progress State */}
        {loading && (
          <div className="p-8 border border-neutral-800 bg-neutral-900/40 rounded-xl text-center space-y-3 animate-pulse">
            <div className="text-sm font-medium text-neutral-300">
              Cloning repository into local workspaces...
            </div>
            <div className="text-xs text-neutral-500">
              Performing shallow clone and reading documentation (README, CONTRIBUTING).
            </div>
          </div>
        )}

        {/* Ingested Repository Result Card */}
        {repo && !loading && (
          <div className="border border-neutral-800 bg-neutral-900/60 rounded-xl overflow-hidden shadow-lg space-y-6 p-6">
            {/* Repo Title & Details */}
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
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-neutral-400 hover:text-white underline underline-offset-4 self-start sm:self-center"
              >
                View on GitHub &rarr;
              </a>
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

            {/* Documentation Tabs */}
            <div className="space-y-3">
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
              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 max-h-96 overflow-y-auto font-mono text-xs text-neutral-300 whitespace-pre-wrap">
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

            {/* Phase 2 Transition Notice */}
            <div className="p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-emerald-300">
              <span>
                ✓ Repository ingested into local workspaces. Ready for Phase 2: AST & Dependency Graph parsing.
              </span>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
