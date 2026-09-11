"""
NetworkX Dependency Graph Construction and Metrics Service.
Assembles directed dependency graphs from AST parse results, resolves imports
to local project files, and computes architectural graph metrics.
"""

from pathlib import Path
from typing import List, Dict, Set, Tuple, Optional, Any
import networkx as nx

from models.graph import (
    FileParseResult,
    GraphNode,
    GraphEdge,
    GraphMetrics,
    TopCentralFile,
    GraphResponse,
)


def resolve_import_to_file(
    import_stmt: str,
    source_file: str,
    known_files: Set[str]
) -> Optional[str]:
    """
    Resolves an import string (Python dotted path or JS/TS relative path) to an actual
    file path within the repository's known files.
    
    Args:
        import_stmt: The raw import string (e.g. 'services.github' or './components/Button').
        source_file: The relative path of the file containing the import.
        known_files: Set of all normalized relative file paths in the workspace.
        
    Returns:
        The matched relative file path, or None if external/unresolved.
    """
    cleaned = import_stmt.strip()

    # 1. Exact match in known files
    if cleaned in known_files:
        return cleaned

    # 2. Python module resolution: 'services.github' -> 'services/github.py'
    py_candidate = cleaned.replace(".", "/") + ".py"
    if py_candidate in known_files:
        return py_candidate

    # Check relative to source file directory (e.g. backend/services/github.py)
    source_dir = Path(source_file).parent.as_posix()
    if source_dir and source_dir != ".":
        nested_candidate = f"{source_dir}/{py_candidate}"
        if nested_candidate in known_files:
            return nested_candidate

    # Check under common subdirectories like 'backend/' or 'src/'
    for prefix in ["backend", "src", "app", "lib"]:
        prefixed = f"{prefix}/{py_candidate}"
        if prefixed in known_files:
            return prefixed

    # Check package __init__.py (e.g. 'models' -> 'models/__init__.py')
    init_candidate = cleaned.replace(".", "/") + "/__init__.py"
    if init_candidate in known_files:
        return init_candidate
    for prefix in ["backend", "src"]:
        prefixed_init = f"{prefix}/{init_candidate}"
        if prefixed_init in known_files:
            return prefixed_init

    # 3. JavaScript/TypeScript relative resolution: './components/Button' or '../utils'
    if cleaned.startswith(("./", "../")):
        source_parent = Path(source_file).parent
        resolved_path = (source_parent / cleaned).as_posix()

        # Try various JS/TS extensions
        for ext in [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]:
            candidate = resolved_path + ext
            # Normalize path (resolve '..' components)
            try:
                norm = Path(candidate).as_posix()
                if norm in known_files:
                    return norm
            except Exception:
                continue

    return None


def build_repository_graph(
    parse_results: List[FileParseResult],
    repo_id: str,
    now_iso: str
) -> GraphResponse:
    """
    Constructs a NetworkX DiGraph from parsed source files, calculates graph
    metrics (degrees, centrality, clusters), and formats into a GraphResponse.
    
    Args:
        parse_results: List of AST parse results for the repository files.
        repo_id: Canonical repository identifier ('owner/repo').
        now_iso: Current ISO timestamp.
        
    Returns:
        GraphResponse containing nodes, edges, and computed metrics.
    """
    G = nx.DiGraph()
    known_files: Set[str] = {r.file_path for r in parse_results}
    file_map: Dict[str, FileParseResult] = {r.file_path: r for r in parse_results}

    # Add all source files as nodes
    for file_path, data in file_map.items():
        G.add_node(
            file_path,
            label=Path(file_path).name,
            language=data.language,
            line_count=data.line_count,
            symbols=[s.model_dump() for s in data.symbols],
        )

    # Add directed edges for resolved imports (Source -> Target imports relationship)
    for source_file, data in file_map.items():
        for imp in data.imports:
            target_file = resolve_import_to_file(imp, source_file, known_files)
            if target_file and target_file != source_file:
                G.add_edge(source_file, target_file, type="imports")

    # 1. Degree metrics
    in_degrees = dict(G.in_degree())
    out_degrees = dict(G.out_degree())

    # 2. Degree centrality
    try:
        centrality = nx.degree_centrality(G)
    except Exception:
        centrality = {node: 0.0 for node in G.nodes()}

    # 3. Weakly connected components (community / module clusters)
    clusters_map: Dict[str, int] = {}
    cluster_idx = 0
    for component in nx.weakly_connected_components(G):
        for node in component:
            clusters_map[node] = cluster_idx
        cluster_idx += 1

    # 4. Density
    density = nx.density(G) if len(G) > 1 else 0.0

    # 5. Top central files
    sorted_central = sorted(
        centrality.items(),
        key=lambda item: (item[1], in_degrees.get(item[0], 0)),
        reverse=True
    )
    top_central: List[TopCentralFile] = [
        TopCentralFile(
            file=node,
            score=round(score, 4),
            in_degree=in_degrees.get(node, 0),
            out_degree=out_degrees.get(node, 0),
        )
        for node, score in sorted_central[:5]
    ]

    # Build GraphNode list
    graph_nodes: List[GraphNode] = []
    for node_id in G.nodes():
        node_attr = G.nodes[node_id]
        p_res = file_map.get(node_id)
        graph_nodes.append(
            GraphNode(
                id=node_id,
                label=node_attr.get("label", node_id),
                node_type="file",
                language=node_attr.get("language", "unknown"),
                line_count=node_attr.get("line_count", 0),
                symbols=p_res.symbols if p_res else [],
                in_degree=in_degrees.get(node_id, 0),
                out_degree=out_degrees.get(node_id, 0),
                centrality=round(centrality.get(node_id, 0.0), 4),
                cluster=clusters_map.get(node_id, 0),
            )
        )

    # Build GraphEdge list
    graph_edges: List[GraphEdge] = [
        GraphEdge(source=u, target=v, type="imports")
        for u, v in G.edges()
    ]

    metrics = GraphMetrics(
        total_nodes=len(graph_nodes),
        total_edges=len(graph_edges),
        density=round(density, 4),
        top_central_files=top_central,
        clusters_count=cluster_idx,
    )

    return GraphResponse(
        repo_id=repo_id,
        metrics=metrics,
        nodes=graph_nodes,
        edges=graph_edges,
        updated_at=now_iso,
    )
