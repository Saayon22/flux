"""
Tree-sitter AST parsing service.
Parses Python, JavaScript/TypeScript, Go, and Rust source code to extract imports, functions, classes, and calls.
"""

import os
from pathlib import Path
from typing import List, Optional, Set, Dict, Any

from tree_sitter import Language, Parser
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_go as tsgo
import tree_sitter_rust as tsrust

from models.graph import CodeSymbol, FileParseResult

# Initialize Tree-sitter parsers
PY_LANGUAGE = Language(tspython.language())
py_parser = Parser(PY_LANGUAGE)

JS_LANGUAGE = Language(tsjavascript.language())
js_parser = Parser(JS_LANGUAGE)

GO_LANGUAGE = Language(tsgo.language())
go_parser = Parser(GO_LANGUAGE)

RUST_LANGUAGE = Language(tsrust.language())
rust_parser = Parser(RUST_LANGUAGE)

# Ignored directory names during repository AST walk
IGNORED_DIRECTORIES: Set[str] = {
    ".git",
    "node_modules",
    "venv",
    ".venv",
    "env",
    ".env",
    "__pycache__",
    ".next",
    "dist",
    "build",
    "out",
    "coverage",
    ".turbo",
    ".idea",
    ".vscode",
    ".pytest_cache",
    "target",
}

# Recognized file extensions by language
PYTHON_EXTENSIONS: Set[str] = {".py"}
JAVASCRIPT_EXTENSIONS: Set[str] = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
GO_EXTENSIONS: Set[str] = {".go"}
RUST_EXTENSIONS: Set[str] = {".rs"}


def _extract_python_docstring(body_node, source_bytes: bytes) -> Optional[str]:
    """Extracts the docstring of a Python function or class."""
    if not body_node or not body_node.children:
        return None
    for child in body_node.children:
        if child.type == "expression_statement":
            for expr in child.children:
                if expr.type == "string":
                    raw = expr.text.decode("utf-8", errors="replace")
                    return raw.strip("\"'").strip()
        elif child.type not in ("comment", "\n", ""):
            break
    return None


def parse_python_source(code_str: str, rel_path: str) -> FileParseResult:
    """Parses Python source code into AST using Tree-sitter."""
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = py_parser.parse(code_bytes)
    root = tree.root_node

    imports: List[str] = []
    symbols: List[CodeSymbol] = []
    line_count = len(code_str.splitlines())

    def visit_node(node, parent_class: Optional[str] = None):
        if node.type == "import_statement":
            for child in node.children:
                if child.type == "dotted_name":
                    imports.append(child.text.decode("utf-8", errors="replace"))
                elif child.type == "aliased_import":
                    name_child = child.child_by_field_name("name")
                    if name_child:
                        imports.append(name_child.text.decode("utf-8", errors="replace"))

        elif node.type == "import_from_statement":
            module_node = node.child_by_field_name("module_name")
            if module_node:
                module_text = module_node.text.decode("utf-8", errors="replace")
                imports.append(module_text)
            else:
                raw_text = node.text.decode("utf-8", errors="replace")
                if "import" in raw_text:
                    parts = raw_text.split("import")[0].replace("from", "").strip()
                    if parts:
                        imports.append(parts)

        elif node.type == "function_definition":
            name_node = node.child_by_field_name("name")
            if name_node:
                fn_name = name_node.text.decode("utf-8", errors="replace")
                if parent_class:
                    fn_name = f"{parent_class}.{fn_name}"
                    symbol_type = "method"
                else:
                    symbol_type = "function"

                body_node = node.child_by_field_name("body")
                docstring = _extract_python_docstring(body_node, code_bytes)

                symbols.append(
                    CodeSymbol(
                        name=fn_name,
                        type=symbol_type,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        docstring=docstring,
                    )
                )

        elif node.type == "class_definition":
            name_node = node.child_by_field_name("name")
            if name_node:
                class_name = name_node.text.decode("utf-8", errors="replace")
                body_node = node.child_by_field_name("body")
                docstring = _extract_python_docstring(body_node, code_bytes)

                symbols.append(
                    CodeSymbol(
                        name=class_name,
                        type="class",
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        docstring=docstring,
                    )
                )

                if body_node:
                    for body_child in body_node.children:
                        visit_node(body_child, parent_class=class_name)
                    return

        for child in node.children:
            visit_node(child, parent_class)

    visit_node(root)

    return FileParseResult(
        file_path=rel_path,
        language="python",
        imports=list(dict.fromkeys(imports)),
        symbols=symbols,
        line_count=line_count,
    )


def parse_javascript_source(code_str: str, rel_path: str) -> FileParseResult:
    """Parses JavaScript/TypeScript source code into AST using Tree-sitter."""
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = js_parser.parse(code_bytes)
    root = tree.root_node

    imports: List[str] = []
    symbols: List[CodeSymbol] = []
    line_count = len(code_str.splitlines())

    def clean_quotes(text: str) -> str:
        return text.strip("\"'`")

    def visit_node(node, parent_class: Optional[str] = None):
        if node.type == "import_statement":
            source_node = node.child_by_field_name("source")
            if source_node:
                module_path = clean_quotes(source_node.text.decode("utf-8", errors="replace"))
                imports.append(module_path)

        elif node.type == "call_expression":
            fn_node = node.child_by_field_name("function")
            if fn_node and fn_node.text.decode("utf-8", errors="replace") == "require":
                args_node = node.child_by_field_name("arguments")
                if args_node and args_node.children:
                    for arg in args_node.children:
                        if arg.type == "string":
                            module_path = clean_quotes(arg.text.decode("utf-8", errors="replace"))
                            imports.append(module_path)

        elif node.type == "function_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                fn_name = name_node.text.decode("utf-8", errors="replace")
                symbols.append(
                    CodeSymbol(
                        name=fn_name,
                        type="function",
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )

        elif node.type == "variable_declarator":
            name_node = node.child_by_field_name("name")
            val_node = node.child_by_field_name("value")
            if name_node and val_node and val_node.type in ("arrow_function", "function"):
                fn_name = name_node.text.decode("utf-8", errors="replace")
                symbols.append(
                    CodeSymbol(
                        name=fn_name,
                        type="function",
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )

        elif node.type == "class_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                class_name = name_node.text.decode("utf-8", errors="replace")
                symbols.append(
                    CodeSymbol(
                        name=class_name,
                        type="class",
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )

                body_node = node.child_by_field_name("body")
                if body_node:
                    for child in body_node.children:
                        if child.type == "method_definition":
                            method_name_node = child.child_by_field_name("name")
                            if method_name_node:
                                m_name = method_name_node.text.decode("utf-8", errors="replace")
                                symbols.append(
                                    CodeSymbol(
                                        name=f"{class_name}.{m_name}",
                                        type="method",
                                        start_line=child.start_point[0] + 1,
                                        end_line=child.end_point[0] + 1,
                                    )
                                )
                    return

        for child in node.children:
            visit_node(child, parent_class)

    visit_node(root)

    return FileParseResult(
        file_path=rel_path,
        language="javascript",
        imports=list(dict.fromkeys(imports)),
        symbols=symbols,
        line_count=line_count,
    )


def parse_go_source(code_str: str, rel_path: str) -> FileParseResult:
    """Parses Go source code into AST using Tree-sitter."""
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = go_parser.parse(code_bytes)
    root = tree.root_node

    imports: List[str] = []
    symbols: List[CodeSymbol] = []
    line_count = len(code_str.splitlines())

    def clean_quotes(text: str) -> str:
        return text.strip("\"'`")

    def visit_node(node):
        # 1. Imports
        if node.type == "import_spec":
            path_node = node.child_by_field_name("path")
            if path_node:
                imports.append(clean_quotes(path_node.text.decode("utf-8", errors="replace")))
            else:
                for child in node.children:
                    if "string_literal" in child.type:
                        imports.append(clean_quotes(child.text.decode("utf-8", errors="replace")))

        # 2. Functions
        elif node.type == "function_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                fn_name = name_node.text.decode("utf-8", errors="replace")
                symbols.append(
                    CodeSymbol(
                        name=fn_name,
                        type="function",
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )

        # 3. Methods
        elif node.type == "method_declaration":
            name_node = node.child_by_field_name("name")
            receiver_node = node.child_by_field_name("receiver")
            receiver_name = ""
            if receiver_node:
                rec_text = receiver_node.text.decode("utf-8", errors="replace").strip("()")
                parts = rec_text.split()
                receiver_name = parts[-1].lstrip("*") if parts else ""

            if name_node:
                fn_name = name_node.text.decode("utf-8", errors="replace")
                display_name = f"{receiver_name}.{fn_name}" if receiver_name else fn_name
                symbols.append(
                    CodeSymbol(
                        name=display_name,
                        type="method",
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )

        # 4. Structs / Interfaces / Types
        elif node.type == "type_spec":
            name_node = node.child_by_field_name("name")
            type_node = node.child_by_field_name("type")
            if name_node:
                type_name = name_node.text.decode("utf-8", errors="replace")
                kind = "class"
                if type_node and "interface" in type_node.type:
                    kind = "interface"
                symbols.append(
                    CodeSymbol(
                        name=type_name,
                        type=kind,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )

        for child in node.children:
            visit_node(child)

    visit_node(root)

    return FileParseResult(
        file_path=rel_path,
        language="go",
        imports=list(dict.fromkeys(imports)),
        symbols=symbols,
        line_count=line_count,
    )


def parse_rust_source(code_str: str, rel_path: str) -> FileParseResult:
    """Parses Rust source code into AST using Tree-sitter."""
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = rust_parser.parse(code_bytes)
    root = tree.root_node

    imports: List[str] = []
    symbols: List[CodeSymbol] = []
    line_count = len(code_str.splitlines())

    def visit_node(node, parent_impl: Optional[str] = None):
        # 1. Use / Mod imports
        if node.type == "use_declaration":
            arg_node = node.child_by_field_name("argument")
            if arg_node:
                imports.append(arg_node.text.decode("utf-8", errors="replace"))
            else:
                raw = node.text.decode("utf-8", errors="replace").replace("use", "").replace(";", "").strip()
                if raw:
                    imports.append(raw)

        elif node.type == "mod_item":
            name_node = node.child_by_field_name("name")
            if name_node:
                imports.append(f"mod::{name_node.text.decode('utf-8', errors='replace')}")

        # 2. Functions
        elif node.type == "function_item":
            name_node = node.child_by_field_name("name")
            if name_node:
                fn_name = name_node.text.decode("utf-8", errors="replace")
                if parent_impl:
                    fn_name = f"{parent_impl}.{fn_name}"
                    sym_type = "method"
                else:
                    sym_type = "function"

                symbols.append(
                    CodeSymbol(
                        name=fn_name,
                        type=sym_type,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )

        # 3. Structs / Enums / Traits
        elif node.type in ("struct_item", "enum_item", "trait_item"):
            name_node = node.child_by_field_name("name")
            if name_node:
                item_name = name_node.text.decode("utf-8", errors="replace")
                sym_type = "interface" if node.type == "trait_item" else "class"
                symbols.append(
                    CodeSymbol(
                        name=item_name,
                        type=sym_type,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )

        # 4. Impl blocks
        elif node.type == "impl_item":
            type_node = node.child_by_field_name("type")
            impl_name = type_node.text.decode("utf-8", errors="replace") if type_node else None
            body_node = node.child_by_field_name("body")
            if body_node:
                for child in body_node.children:
                    visit_node(child, parent_impl=impl_name)
                return

        for child in node.children:
            visit_node(child, parent_impl)

    visit_node(root)

    return FileParseResult(
        file_path=rel_path,
        language="rust",
        imports=list(dict.fromkeys(imports)),
        symbols=symbols,
        line_count=line_count,
    )


def parse_repository(repo_dir: Path) -> List[FileParseResult]:
    """Traverses a repository directory and parses source files (Python, JS, TS, Go, Rust)."""
    results: List[FileParseResult] = []

    for root, dirs, files in os.walk(repo_dir):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRECTORIES and not d.startswith(".")]

        for file_name in files:
            file_path = Path(root) / file_name
            ext = file_path.suffix.lower()

            is_py = ext in PYTHON_EXTENSIONS
            is_js = ext in JAVASCRIPT_EXTENSIONS
            is_go = ext in GO_EXTENSIONS
            is_rs = ext in RUST_EXTENSIONS

            if not (is_py or is_js or is_go or is_rs):
                continue

            rel_path = file_path.relative_to(repo_dir).as_posix()

            try:
                content = file_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue

            try:
                if is_py:
                    parsed = parse_python_source(content, rel_path)
                elif is_js:
                    parsed = parse_javascript_source(content, rel_path)
                elif is_go:
                    parsed = parse_go_source(content, rel_path)
                elif is_rs:
                    parsed = parse_rust_source(content, rel_path)
                else:
                    continue
                results.append(parsed)
            except Exception as e:
                print(f"[WARN] Failed to parse {rel_path} with Tree-sitter: {e}")
                continue

    return results
