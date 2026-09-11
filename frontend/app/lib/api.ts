// API client module for interacting with the flux FastAPI backend.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

export interface RepoMetadata {
  id: string;
  url: string;
  owner: string;
  name: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stars: number;
  open_issues_count: number;
  clone_path: string;
  file_count: number;
  status: string;
  error_message: string | null;
  has_readme: boolean;
  has_contributing: boolean;
  readme_content?: string | null;
  contributing_content?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestResponse {
  success: boolean;
  message: string;
  repository: RepoMetadata;
}

// Ingests a repository by its GitHub URL or shorthand and returns metadata.
export async function ingestRepository(
  url: string,
  forceRefresh: boolean = false
): Promise<IngestResponse> {
  const response = await fetch(`${BACKEND_URL}/api/repos/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      force_refresh: forceRefresh,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.detail || `Server returned error (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

// Fetches the metadata and documentation of an ingested repository.
export async function getRepository(
  owner: string,
  repo: string
): Promise<RepoMetadata> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to fetch repository");
  }

  return response.json();
}

// Fetches a list of recently ingested repositories.
export async function listRepositories(): Promise<RepoMetadata[]> {
  const response = await fetch(`${BACKEND_URL}/api/repos`);
  if (!response.ok) {
    return [];
  }
  return response.json();
}

export interface CodeSymbol {
  name: string;
  type: string;
  start_line: number;
  end_line: number;
  docstring?: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  node_type: string;
  language: string;
  line_count: number;
  symbols: CodeSymbol[];
  in_degree: number;
  out_degree: number;
  centrality: number;
  cluster: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface TopCentralFile {
  file: string;
  score: number;
  in_degree: number;
  out_degree: number;
}

export interface GraphMetrics {
  total_nodes: number;
  total_edges: number;
  density: number;
  top_central_files: TopCentralFile[];
  clusters_count: number;
}

export interface GraphResponse {
  repo_id: string;
  metrics: GraphMetrics;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updated_at: string;
}

// Initiates AST parsing and builds the NetworkX dependency graph for a repository.
export async function buildRepoGraph(
  owner: string,
  repo: string
): Promise<GraphResponse> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/graph/build`, {
    method: "POST",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to build dependency graph");
  }

  return response.json();
}

// Fetches the existing dependency graph for a repository if already computed.
export async function getRepoGraph(
  owner: string,
  repo: string
): Promise<GraphResponse | null> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/graph`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to fetch dependency graph");
  }

  return response.json();
}

export interface FeatureItem {
  name: string;
  description: string;
  files: string[];
}

export interface ArchitectureFlow {
  component: string;
  role: string;
  central_file: string;
  connections: string[];
}

export interface RepoUnderstanding {
  repo_id: string;
  overview: string;
  architecture_summary: string;
  feature_map: FeatureItem[];
  flows: ArchitectureFlow[];
  model_used: string;
  is_fallback: boolean;
  digest?: string | null;
  created_at: string;
}

// Generates plain-English repository understanding from digest context.
export async function generateRepoUnderstanding(
  owner: string,
  repo: string
): Promise<RepoUnderstanding> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/understand`, {
    method: "POST",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to generate repository understanding");
  }

  return response.json();
}

// Fetches cached repository understanding if already computed.
export async function getRepoUnderstanding(
  owner: string,
  repo: string
): Promise<RepoUnderstanding | null> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/understand`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to fetch repository understanding");
  }

  return response.json();
}

export interface FileContentResponse {
  path: string;
  language: string;
  line_count: number;
  content: string;
  is_truncated: boolean;
  error?: string | null;
}

// Fetches the source code content of a file in the repository workspace.
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string
): Promise<FileContentResponse> {
  const params = new URLSearchParams({ path });
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/files/content?${params.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to load file content");
  }
  return response.json();
}

export interface IssueLabel {
  name: string;
  color: string;
  description?: string | null;
}

export interface IssueSummary {
  id: string;
  number: number;
  title: string;
  body?: string;
  state: string;
  author: string;
  labels: IssueLabel[];
  comments_count: number;
  html_url: string;
  created_at: string;
}

export interface RelevantFileItem {
  file: string;
  reason: string;
  symbols_to_inspect: string[];
}

export interface IssueExplanation {
  issue_id: string;
  repo_id: string;
  issue_number: number;
  plain_english_summary: string;
  real_world_analogy: string;
  relevant_files: RelevantFileItem[];
  implementation_steps: string[];
  estimated_complexity: string;
  model_used: string;
  is_fallback: boolean;
  created_at: string;
}

export interface IssueListResponse {
  repo_id: string;
  total_count: number;
  available_labels: IssueLabel[];
  issues: IssueSummary[];
}

// Fetches open issues for a repository with optional label filtering.
export async function fetchRepoIssues(
  owner: string,
  repo: string,
  label?: string,
  forceRefresh: boolean = false,
  state: string = "open"
): Promise<IssueListResponse> {
  const params = new URLSearchParams();
  if (label && label.toLowerCase() !== "all") {
    params.set("label", label);
  }
  if (forceRefresh) {
    params.set("force_refresh", "true");
  }
  if (state) {
    params.set("state", state);
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/issues${query}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to fetch issues");
  }
  return response.json();
}

// Generates or retrieves an on-demand plain-English explanation for a specific issue.
export async function explainIssue(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<IssueExplanation> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/issues/${issueNumber}/explain`, {
    method: "POST",
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to generate issue explanation");
  }
  return response.json();
}

// Seeds a demo issue for testing when a repository has 0 open GitHub issues.
export async function seedDemoIssue(
  owner: string,
  repo: string
): Promise<IssueSummary> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/issues/seed`, {
    method: "POST",
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to seed demo issue");
  }
  return response.json();
}

export interface DiffStats {
  line_count: number;
  files_touched: string[];
  validation_passed: boolean;
  pre_routed?: boolean;
  reason?: string;
}

export interface PullRequestResult {
  status: string;
  action: string;
  pr_url: string;
  pr_number: number;
  branch: string;
  fork_ref: string;
}

export interface PlanArtifact {
  title: string;
  summary: string;
  steps: string[];
  estimated_risk: string;
  recommended_reviewers: string[];
  issue_context?: string;
  problem_statement?: string;
  affected_modules?: string[];
  quality_assurance?: string[];
  markdown_content?: string;
  diff_metrics?: {
    line_count: number;
    num_files: number;
    threshold_lines: number;
    threshold_files: number;
  };
}

export interface AgentHandoffResponse {
  status: "success" | "declined" | "error";
  authorized: boolean;
  repo_id?: string;
  issue_number?: number;
  fork?: {
    fork_ref: string;
    fork_url: string;
    provisioned: boolean;
  };
  diff?: string;
  diff_stats?: DiffStats;
  decision?: "pr" | "plan";
  pr?: PullRequestResult | null;
  plan?: PlanArtifact | null;
  message: string;
  created_at?: string;
  updated_at?: string;
}

export interface AgentStatusResponse {
  status: string;
  agent: string;
  framework: string;
  sdk: string;
  model: string;
  models?: {
    cheap: string;
    strong: string;
  };
  has_api_key: boolean;
  github?: {
    authenticated: boolean;
    user: string | null;
    limit: number;
    remaining: number;
    reset: number | null;
  };
  capabilities: string[];
}

// Retrieves cached agent handoff results for an issue if previously executed.
export async function getHandoffResult(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<AgentHandoffResponse | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/issues/${issueNumber}/handoff`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// Executes the Google ADK Agent Handoff workflow for a specific issue.
export async function triggerAgentHandoff(

  owner: string,
  repo: string,
  issueNumber: number,
  optIn: boolean = true,
  userNotes?: string
): Promise<AgentHandoffResponse> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/issues/${issueNumber}/handoff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      opt_in: optIn,
      user_notes: userNotes || null,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to execute agent handoff");
  }

  return response.json();
}

// Publishes a verified code patch as a GitHub Pull Request after developer review.
export async function publishPullRequest(
  owner: string,
  repo: string,
  issueNumber: number,
  data?: { diff?: string; fork_ref?: string }
): Promise<{ status: string; action: string; pr: PullRequestResult; message: string }> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/issues/${issueNumber}/publish-pr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data || {}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to publish Pull Request");
  }

  return response.json();
}

// Discards local workspace modifications and rolls back the temporary fix branch.
export async function rollbackHandoff(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ status: string; repo_id: string; issue_number: number; message: string }> {
  const response = await fetch(`${BACKEND_URL}/api/repos/${owner}/${repo}/issues/${issueNumber}/rollback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to rollback handoff changes");
  }

  return response.json();
}

// Fetches Google ADK agent system status and model capabilities.
export async function getAgentStatus(): Promise<AgentStatusResponse> {
  const response = await fetch(`${BACKEND_URL}/api/agent/status`);
  if (!response.ok) {
    throw new Error("Failed to fetch agent status");
  }
  return response.json();
}

// Sends a message to the interactive Google ADK agent chat endpoint.
export async function chatWithAgent(
  message: string,
  sessionId?: string
): Promise<{ status: string; session_id: string; response: string }> {
  const response = await fetch(`${BACKEND_URL}/api/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      session_id: sessionId || null,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to chat with agent");
  }

  return response.json();
}

