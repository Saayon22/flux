# Grounded Graph Relevance Finder Service for identifying 1-hop neighborhoods around issues.

import re
from typing import List, Dict
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


# Identifies relevant files in the dependency graph matching issue title and body.
def find_relevant_graph_context(issue_title: str, issue_body: str, graph: GraphResponse) -> List[RelevantNodeContext]:
    text_corpus = f"{issue_title} {issue_body}".lower()

    inbound_map: Dict[str, List[str]] = {}
    outbound_map: Dict[str, List[str]] = {}
    for edge in graph.edges:
        outbound_map.setdefault(edge.source, []).append(edge.target)
        inbound_map.setdefault(edge.target, []).append(edge.source)

    node_map: Dict[str, GraphNode] = {n.id: n for n in graph.nodes}
    matched_nodes: Dict[str, str] = {}

    for node in graph.nodes:
        node_id_lower = node.id.lower()
        node_label_lower = node.label.lower()
        base_name = node_label_lower.split(".")[0]

        if node_id_lower in text_corpus or (len(node_label_lower) > 3 and node_label_lower in text_corpus):
            matched_nodes[node.id] = f"Directly mentioned in issue text (`{node.label}`)"
            continue

        if len(base_name) > 3 and re.search(rf"\b{re.escape(base_name)}\b", text_corpus):
            matched_nodes[node.id] = f"Filename keyword matched in issue text (`{base_name}`)"
            continue

        if node.symbols:
            for sym in node.symbols:
                sym_name_lower = sym.name.lower()
                if len(sym_name_lower) > 3 and re.search(rf"\b{re.escape(sym_name_lower)}\b", text_corpus):
                    matched_nodes[node.id] = f"Contains function/symbol `{sym.name}` mentioned in issue"
                    break

    # Falls back to top central hub files if no specific file was mentioned
    if not matched_nodes and graph.nodes:
        top_files = [cf.file for cf in graph.metrics.top_central_files[:3]] if graph.metrics.top_central_files else [n.id for n in graph.nodes[:2]]
        for tf in top_files:
            if tf in node_map:
                matched_nodes[tf] = "Central architectural hub with high graph centrality"

    results: List[RelevantNodeContext] = []
    for nid in list(matched_nodes.keys())[:4]:
        node = node_map.get(nid)
        if not node:
            continue
        results.append(
            RelevantNodeContext(
                node_id=node.id,
                label=node.label,
                reason=matched_nodes[nid],
                symbols=[s.name for s in (node.symbols or [])[:5]],
                predecessors=inbound_map.get(nid, [])[:4],
                successors=outbound_map.get(nid, [])[:4],
            )
        )

    return results


# Formats the 1-hop graph neighborhood into a plain-text prompt digest.
def format_issue_graph_digest(contexts: List[RelevantNodeContext]) -> str:
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
