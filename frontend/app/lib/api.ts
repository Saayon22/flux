/**
 * API client module for interacting with the flux FastAPI backend.
 * Handles repository ingestion requests and metadata fetching.
 */

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

/**
 * Ingests a repository by its GitHub URL or shorthand (owner/repo).
 * Clones the repository locally and returns metadata and documentation.
 *
 * @param url Full GitHub URL or owner/repo format.
 * @param forceRefresh Optional flag to force re-cloning if already present.
 */
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

/**
 * Fetches the metadata and documentation of an ingested repository.
 *
 * @param owner Repository owner/org
 * @param repo Repository name
 */
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

/**
 * Fetches a list of recently ingested repositories.
 */
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

/**
 * Initiates AST parsing and builds the NetworkX dependency graph for a repository.
 *
 * @param owner Repository owner
 * @param repo Repository name
 */
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

/**
 * Fetches the existing dependency graph for a repository if already computed.
 *
 * @param owner Repository owner
 * @param repo Repository name
 */
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

/**
 * Generates plain-English repository understanding (overview, feature map, architecture).
 *
 * @param owner Repository owner
 * @param repo Repository name
 */
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

/**
 * Fetches cached repository understanding if already computed.
 *
 * @param owner Repository owner
 * @param repo Repository name
 */
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


