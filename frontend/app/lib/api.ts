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
