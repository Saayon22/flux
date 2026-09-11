# Repository Digest Builder Service for synthesizing context into Markdown for LLM prompts.

from typing import Dict, Any, List
from collections import defaultdict
from models.graph import GraphResponse


# Formats repository metadata, dependency metrics, central hubs, and documentation into a prompt digest.
def build_repository_digest(repo_data: Dict[str, Any], graph_response: GraphResponse) -> str:
    metrics = graph_response.metrics
    nodes = graph_response.nodes

    clusters: Dict[int, List[str]] = defaultdict(list)
    for node in nodes:
        clusters[node.cluster].append(node.id)

    central_files_lines = []
    for cf in metrics.top_central_files:
        node_match = next((n for n in nodes if n.id == cf.file), None)
        sym_summary = []
        if node_match and node_match.symbols:
            funcs = [s.name for s in node_match.symbols if s.type in ("function", "method")][:4]
            classes = [s.name for s in node_match.symbols if s.type == "class"][:2]
            if classes:
                sym_summary.append(f"Classes: {', '.join(classes)}")
            if funcs:
                sym_summary.append(f"Functions: {', '.join(funcs)}")

        sym_str = f" ({'; '.join(sym_summary)})" if sym_summary else ""
        central_files_lines.append(f"- `{cf.file}` — Centrality: {cf.score}, Imported by: {cf.in_degree} files, Imports: {cf.out_degree} files{sym_str}")

    cluster_lines = []
    for c_id, f_list in sorted(clusters.items()):
        sample_files = ", ".join([f"`{f}`" for f in f_list[:5]])
        extra = f" (+{len(f_list) - 5} more)" if len(f_list) > 5 else ""
        cluster_lines.append(f"- **Module Cluster {c_id + 1}** ({len(f_list)} files): {sample_files}{extra}")

    readme_excerpt = (repo_data.get("readme_content") or "No README documentation provided.").strip()[:2500]
    contributing_excerpt = (repo_data.get("contributing_content") or "").strip()[:1000]

    digest_parts = [
        f"# Repository Digest: {repo_data.get('owner')}/{repo_data.get('name')}",
        "",
        "## General Metadata",
        f"- **Repository URL:** {repo_data.get('url')}",
        f"- **Primary Language:** {repo_data.get('language') or 'Unknown'}",
        f"- **Description:** {repo_data.get('description') or 'No description provided.'}",
        f"- **Total Files Cloned:** {repo_data.get('file_count', len(nodes))}",
        "",
        "## Dependency Graph Metrics",
        f"- **Parsed Source Files (Nodes):** {metrics.total_nodes}",
        f"- **Import Relationships (Edges):** {metrics.total_edges}",
        f"- **Graph Density:** {metrics.density}",
        f"- **Distinct Functional Clusters:** {metrics.clusters_count}",
        "",
        "## Core Architectural Backbone (Highest Centrality Files)",
        "\n".join(central_files_lines) if central_files_lines else "- No central files identified.",
        "",
        "## Functional Module Clusters",
        "\n".join(cluster_lines) if cluster_lines else "- Single unified module.",
        "",
        "## Documentation Highlights (README)",
        "```markdown",
        readme_excerpt,
        "```",
    ]

    if contributing_excerpt:
        digest_parts.extend(["", "## Contributing Guidelines", "```markdown", contributing_excerpt, "```"])

    return "\n".join(digest_parts)
