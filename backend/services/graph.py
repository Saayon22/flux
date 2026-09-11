# NetworkX Dependency Graph Construction and Metrics Service.

from pathlib import Path
from typing import List, Dict, Set, Optional
import networkx as nx

from models.graph import (
    FileParseResult,
    GraphNode,
    GraphEdge,
    GraphMetrics,
    TopCentralFile,
    GraphResponse,
)


# Resolves an import statement string to a known project file path.
def resolve_import_to_file(import_stmt: str, source_file: str, known_files: Set[str]) -> Optional[str]:
    cleaned = import_stmt.strip()

    if cleaned in known_files:
        return cleaned

    # Python module resolution
    py_candidate = cleaned.replace(".", "/") + ".py"
    if py_candidate in known_files:
        return py_candidate

    source_dir = Path(source_file).parent.as_posix()
    if source_dir and source_dir != ".":
        nested_candidate = f"{source_dir}/{py_candidate}"
        if nested_candidate in known_files:
            return nested_candidate

    for prefix in ["backend", "src", "app", "lib"]:
        prefixed = f"{prefix}/{py_candidate}"
        if prefixed in known_files:
            return prefixed

    init_candidate = cleaned.replace(".", "/") + "/__init__.py"
    if init_candidate in known_files:
        return init_candidate
    for prefix in ["backend", "src"]:
        if f"{prefix}/{init_candidate}" in known_files:
            return f"{prefix}/{init_candidate}"

    # JavaScript and TypeScript relative resolution
    if cleaned.startswith(("./", "../")):
        source_parent = Path(source_file).parent
        resolved_path = (source_parent / cleaned).as_posix()
        for ext in [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]:
            candidate = resolved_path + ext
            try:
                norm = Path(candidate).as_posix()
                if norm in known_files:
                    return norm
            except Exception:
                continue

    # Go package resolution
    go_base = cleaned.split("/")[-1]
    for kf in known_files:
        if kf.endswith(".go") and (Path(kf).parent.name == go_base or kf == f"{cleaned}.go"):
            return kf

    # Rust module and crate resolution
    rust_cleaned = cleaned.replace("mod::", "").replace("crate::", "").replace("super::", "").replace("self::", "")
    rust_parts = rust_cleaned.split("::")
    if rust_parts:
        r_mod = rust_parts[0]
        candidates = [f"{r_mod}.rs", f"{r_mod}/mod.rs", f"src/{r_mod}.rs", f"src/{r_mod}/mod.rs"]
        if source_dir and source_dir != ".":
            candidates.extend([f"{source_dir}/{r_mod}.rs", f"{source_dir}/{r_mod}/mod.rs"])
        for cand in candidates:
            if cand in known_files:
                return cand

    return None


# Constructs a directed dependency graph from AST parse results and computes metrics.
def build_repository_graph(parse_results: List[FileParseResult], repo_id: str, now_iso: str) -> GraphResponse:
    G = nx.DiGraph()
    known_files: Set[str] = {r.file_path for r in parse_results}
    file_map: Dict[str, FileParseResult] = {r.file_path: r for r in parse_results}

    for file_path, data in file_map.items():
        G.add_node(
            file_path,
            label=Path(file_path).name,
            language=data.language,
            line_count=data.line_count,
            symbols=[s.model_dump() for s in data.symbols],
        )

    # Adds directed edges for resolved imports
    for source_file, data in file_map.items():
        for imp in data.imports:
            target = resolve_import_to_file(imp, source_file, known_files)
            if target and target != source_file:
                G.add_edge(source_file, target, type="imports")

    in_degrees = dict(G.in_degree())
    out_degrees = dict(G.out_degree())

    try:
        centrality = nx.degree_centrality(G)
    except Exception:
        centrality = {node: 0.0 for node in G.nodes()}

    clusters_map: Dict[str, int] = {}
    cluster_idx = 0
    for component in nx.weakly_connected_components(G):
        for node in component:
            clusters_map[node] = cluster_idx
        cluster_idx += 1

    density = nx.density(G) if len(G) > 1 else 0.0

    sorted_central = sorted(centrality.items(), key=lambda item: (item[1], in_degrees.get(item[0], 0)), reverse=True)
    top_central = [
        TopCentralFile(
            file=node,
            score=round(score, 4),
            in_degree=in_degrees.get(node, 0),
            out_degree=out_degrees.get(node, 0),
        )
        for node, score in sorted_central[:5]
    ]

    graph_nodes = [
        GraphNode(
            id=node_id,
            label=G.nodes[node_id].get("label", node_id),
            node_type="file",
            language=G.nodes[node_id].get("language", "unknown"),
            line_count=G.nodes[node_id].get("line_count", 0),
            symbols=file_map[node_id].symbols if node_id in file_map else [],
            in_degree=in_degrees.get(node_id, 0),
            out_degree=out_degrees.get(node_id, 0),
            centrality=round(centrality.get(node_id, 0.0), 4),
            cluster=clusters_map.get(node_id, 0),
        )
        for node_id in G.nodes()
    ]

    graph_edges = [GraphEdge(source=u, target=v, type="imports") for u, v in G.edges()]

    return GraphResponse(
        repo_id=repo_id,
        metrics=GraphMetrics(
            total_nodes=len(graph_nodes),
            total_edges=len(graph_edges),
            density=round(density, 4),
            top_central_files=top_central,
            clusters_count=cluster_idx,
        ),
        nodes=graph_nodes,
        edges=graph_edges,
        updated_at=now_iso,
    )
