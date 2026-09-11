"""
Grounded Graph Relevance Finder Service.
Extracts the 1-hop graph neighborhood around files and functions relevant to a GitHub issue.
"""

import re
from typing import List, Dict, Set, Any
from models.graph import GraphResponse, GraphNode


class RelevantNodeContext:
    def __init__(
        self,
        node_id: str,
        label: str,
        reason: str,
        symbols: List[str],
        predecessors: List[str],
        successors: List[str],
    ):
        self.node_id = node_id
        self.label = label
        self.reason = reason
        self.symbols = symbols
        self.predecessors = predecessors
        self.successors = successors


def find_relevant_graph_context(
    issue_title: str,
    issue_body: str,
    graph: GraphResponse
) -> List[RelevantNodeContext]:
    """
    Scans issue title and description against repository dependency graph nodes,
    identifying relevant files and extracting their 1-hop graph neighborhood.
    
    Args:
        issue_title: Issue title string.
        issue_body: Issue description string.
        graph: Computed GraphResponse instance with nodes and edges.
        
    Returns:
        List of RelevantNodeContext objects representing affected 1-hop neighborhoods.
    """
    text_corpus = f"{issue_title} {issue_body}".lower()

    # Pre-build edge lookups
    inbound_map: Dict[str, List[str]] = {}
    outbound_map: Dict[str, List[str]] = {}
    for edge in graph.edges:
        outbound_map.setdefault(edge.source, []).append(edge.target)
        inbound_map.setdefault(edge.target, []).append(edge.source)

    node_map: Dict[str, GraphNode] = {n.id: n for n in graph.nodes}

    # 1. Match nodes against issue text
    matched_nodes: Dict[str, str] = {}  # node_id -> reason

    for node in graph.nodes:
        node_id_lower = node.id.lower()
        node_label_lower = node.label.lower()
        base_name = node_label_lower.split(".")[0]

        # Exact file path or filename match
        if node_id_lower in text_corpus or (len(node_label_lower) > 3 and node_label_lower in text_corpus):
            matched_nodes[node.id] = f"Directly mentioned in issue text (`{node.label}`)"
            continue

        # Check if basename matches a standalone word (e.g., 'todos' in 'backend/app/todos.py')
        if len(base_name) > 3 and re.search(rf"\b{re.escape(base_name)}\b", text_corpus):
            matched_nodes[node.id] = f"Filename keyword matched in issue text (`{base_name}`)"
            continue

        # Match defined symbols (function or class names)
        if node.symbols:
            for sym in node.symbols:
                sym_name_lower = sym.name.lower()
                if len(sym_name_lower) > 3 and re.search(rf"\b{re.escape(sym_name_lower)}\b", text_corpus):
                    matched_nodes[node.id] = f"Contains function/symbol `{sym.name}` mentioned in issue"
                    break

    # 2. Fallback if no specific file was mentioned
    # Use top central hub files from graph metrics as entry points
    if not matched_nodes and graph.nodes:
        top_files = [cf.file for cf in graph.metrics.top_central_files[:3]] if graph.metrics.top_central_files else []
        if not top_files:
            top_files = [n.id for n in graph.nodes[:2]]

        for tf in top_files:
            if tf in node_map:
                matched_nodes[tf] = f"Central architectural hub with high graph centrality"

    # 3. Assemble 1-hop neighborhoods for matched nodes (limit to top 4 primary nodes)
    results: List[RelevantNodeContext] = []
    primary_node_ids = list(matched_nodes.keys())[:4]

    for nid in primary_node_ids:
        node = node_map.get(nid)
        if not node:
            continue

        pred = inbound_map.get(nid, [])[:4]   # Callers / importers
        succ = outbound_map.get(nid, [])[:4]  # Dependencies imported

        symbols_list = [s.name for s in (node.symbols or [])[:5]]

        results.append(
            RelevantNodeContext(
                node_id=node.id,
                label=node.label,
                reason=matched_nodes[nid],
                symbols=symbols_list,
                predecessors=pred,
                successors=succ,
            )
        )

    return results


def format_issue_graph_digest(
    contexts: List[RelevantNodeContext]
) -> str:
    """
    Formats the 1-hop graph neighborhood into a compact plain-text digest for LLM prompting.
    """
    lines: List[str] = ["### Relevant 1-Hop Codebase Neighborhood:"]

    for ctx in contexts:
        lines.append(f"- File: `{ctx.node_id}`")
        lines.append(f"  Reason: {ctx.reason}")
        if ctx.symbols:
            lines.append(f"  Key Symbols: {', '.join(ctx.symbols)}")
        if ctx.successors:
            lines.append(f"  Imports (Outbound): {', '.join(ctx.successors)}")
        if ctx.predecessors:
            lines.append(f"  Imported by (Inbound): {', '.join(ctx.predecessors)}")

    return "\n".join(lines)
