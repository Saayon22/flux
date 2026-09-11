# Tree-sitter AST parsing service for Python, JavaScript/TypeScript, Go, and Rust.

import os
from pathlib import Path
from typing import List, Optional, Set

from tree_sitter import Language, Parser
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_go as tsgo
import tree_sitter_rust as tsrust

from models.graph import CodeSymbol, FileParseResult

# Tree-sitter language parser initializations
PY_LANGUAGE = Language(tspython.language())
py_parser = Parser(PY_LANGUAGE)

JS_LANGUAGE = Language(tsjavascript.language())
js_parser = Parser(JS_LANGUAGE)

GO_LANGUAGE = Language(tsgo.language())
go_parser = Parser(GO_LANGUAGE)

RUST_LANGUAGE = Language(tsrust.language())
rust_parser = Parser(RUST_LANGUAGE)

IGNORED_DIRECTORIES: Set[str] = {
    ".git", "node_modules", "venv", ".venv", "env", ".env",
    "__pycache__", ".next", "dist", "build", "out", "coverage",
    ".turbo", ".idea", ".vscode", ".pytest_cache", "target",
}

PYTHON_EXTENSIONS: Set[str] = {".py"}
JAVASCRIPT_EXTENSIONS: Set[str] = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
GO_EXTENSIONS: Set[str] = {".go"}
RUST_EXTENSIONS: Set[str] = {".rs"}


# Extracts the docstring node text from a Python AST block.
def extract_python_docstring(body_node, source_bytes: bytes) -> Optional[str]:
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


# Parses Python source code using Tree-sitter to extract imports, functions, and classes.
def parse_python_source(code_str: str, rel_path: str) -> FileParseResult:
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = py_parser.parse(code_bytes)
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
                imports.append(module_node.text.decode("utf-8", errors="replace"))
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
                sym_type = "method" if parent_class else "function"
                if parent_class:
                    fn_name = f"{parent_class}.{fn_name}"
                body_node = node.child_by_field_name("body")
                symbols.append(CodeSymbol(
                    name=fn_name,
                    type=sym_type,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                    docstring=extract_python_docstring(body_node, code_bytes),
                ))
        elif node.type == "class_definition":
            name_node = node.child_by_field_name("name")
            if name_node:
                class_name = name_node.text.decode("utf-8", errors="replace")
                body_node = node.child_by_field_name("body")
                symbols.append(CodeSymbol(
                    name=class_name,
                    type="class",
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                    docstring=extract_python_docstring(body_node, code_bytes),
                ))
                if body_node:
                    for body_child in body_node.children:
                        visit_node(body_child, parent_class=class_name)
                    return

        for child in node.children:
            visit_node(child, parent_class)

    visit_node(tree.root_node)
    return FileParseResult(
        file_path=rel_path,
        language="python",
        imports=list(dict.fromkeys(imports)),
        symbols=symbols,
        line_count=line_count,
    )


# Parses JavaScript and TypeScript source code using Tree-sitter.
def parse_javascript_source(code_str: str, rel_path: str) -> FileParseResult:
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = js_parser.parse(code_bytes)
    imports: List[str] = []
    symbols: List[CodeSymbol] = []
    line_count = len(code_str.splitlines())

    def clean_quotes(text: str) -> str:
        return text.strip("\"'`")

    def visit_node(node, parent_class: Optional[str] = None):
        if node.type == "import_statement":
            source_node = node.child_by_field_name("source")
            if source_node:
                imports.append(clean_quotes(source_node.text.decode("utf-8", errors="replace")))
        elif node.type == "call_expression":
            fn_node = node.child_by_field_name("function")
            if fn_node and fn_node.text.decode("utf-8", errors="replace") == "require":
                args_node = node.child_by_field_name("arguments")
                if args_node and args_node.children:
                    for arg in args_node.children:
                        if arg.type == "string":
                            imports.append(clean_quotes(arg.text.decode("utf-8", errors="replace")))
        elif node.type == "function_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                symbols.append(CodeSymbol(
                    name=name_node.text.decode("utf-8", errors="replace"),
                    type="function",
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))
        elif node.type == "variable_declarator":
            name_node = node.child_by_field_name("name")
            val_node = node.child_by_field_name("value")
            if name_node and val_node and val_node.type in ("arrow_function", "function"):
                symbols.append(CodeSymbol(
                    name=name_node.text.decode("utf-8", errors="replace"),
                    type="function",
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))
        elif node.type == "class_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                class_name = name_node.text.decode("utf-8", errors="replace")
                symbols.append(CodeSymbol(
                    name=class_name,
                    type="class",
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))
                body_node = node.child_by_field_name("body")
                if body_node:
                    for child in body_node.children:
                        if child.type == "method_definition":
                            method_name_node = child.child_by_field_name("name")
                            if method_name_node:
                                symbols.append(CodeSymbol(
                                    name=f"{class_name}.{method_name_node.text.decode('utf-8', errors='replace')}",
                                    type="method",
                                    start_line=child.start_point[0] + 1,
                                    end_line=child.end_point[0] + 1,
                                ))
                    return

        for child in node.children:
            visit_node(child, parent_class)

    visit_node(tree.root_node)
    return FileParseResult(
        file_path=rel_path,
        language="javascript",
        imports=list(dict.fromkeys(imports)),
        symbols=symbols,
        line_count=line_count,
    )


# Parses Go source code using Tree-sitter to extract package imports, functions, and structs.
def parse_go_source(code_str: str, rel_path: str) -> FileParseResult:
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = go_parser.parse(code_bytes)
    imports: List[str] = []
    symbols: List[CodeSymbol] = []
    line_count = len(code_str.splitlines())

    def clean_quotes(text: str) -> str:
        return text.strip("\"'`")

    def visit_node(node):
        if node.type == "import_spec":
            path_node = node.child_by_field_name("path")
            if path_node:
                imports.append(clean_quotes(path_node.text.decode("utf-8", errors="replace")))
        elif node.type == "function_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                symbols.append(CodeSymbol(
                    name=name_node.text.decode("utf-8", errors="replace"),
                    type="function",
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))
        elif node.type == "method_declaration":
            name_node = node.child_by_field_name("name")
            receiver_node = node.child_by_field_name("receiver")
            receiver_name = ""
            if receiver_node:
                parts = receiver_node.text.decode("utf-8", errors="replace").strip("()").split()
                receiver_name = parts[-1].lstrip("*") if parts else ""
            if name_node:
                fn_name = name_node.text.decode("utf-8", errors="replace")
                symbols.append(CodeSymbol(
                    name=f"{receiver_name}.{fn_name}" if receiver_name else fn_name,
                    type="method",
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))
        elif node.type == "type_spec":
            name_node = node.child_by_field_name("name")
            type_node = node.child_by_field_name("type")
            if name_node:
                kind = "interface" if type_node and "interface" in type_node.type else "class"
                symbols.append(CodeSymbol(
                    name=name_node.text.decode("utf-8", errors="replace"),
                    type=kind,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))

        for child in node.children:
            visit_node(child)

    visit_node(tree.root_node)
    return FileParseResult(
        file_path=rel_path,
        language="go",
        imports=list(dict.fromkeys(imports)),
        symbols=symbols,
        line_count=line_count,
    )


# Parses Rust source code using Tree-sitter to extract module uses, functions, structs, and traits.
def parse_rust_source(code_str: str, rel_path: str) -> FileParseResult:
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = rust_parser.parse(code_bytes)
    imports: List[str] = []
    symbols: List[CodeSymbol] = []
    line_count = len(code_str.splitlines())

    def visit_node(node, parent_impl: Optional[str] = None):
        if node.type == "use_declaration":
            arg_node = node.child_by_field_name("argument")
            if arg_node:
                imports.append(arg_node.text.decode("utf-8", errors="replace"))
        elif node.type == "mod_item":
            name_node = node.child_by_field_name("name")
            if name_node:
                imports.append(f"mod::{name_node.text.decode('utf-8', errors='replace')}")
        elif node.type == "function_item":
            name_node = node.child_by_field_name("name")
            if name_node:
                fn_name = name_node.text.decode("utf-8", errors="replace")
                symbols.append(CodeSymbol(
                    name=f"{parent_impl}.{fn_name}" if parent_impl else fn_name,
                    type="method" if parent_impl else "function",
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))
        elif node.type in ("struct_item", "enum_item", "trait_item"):
            name_node = node.child_by_field_name("name")
            if name_node:
                symbols.append(CodeSymbol(
                    name=name_node.text.decode("utf-8", errors="replace"),
                    type="interface" if node.type == "trait_item" else "class",
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))
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

    visit_node(tree.root_node)
    return FileParseResult(
        file_path=rel_path,
        language="rust",
        imports=list(dict.fromkeys(imports)),
        symbols=symbols,
        line_count=line_count,
    )


# Traverses a repository directory and parses all supported source files.
def parse_repository(repo_dir: Path) -> List[FileParseResult]:
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
                    results.append(parse_python_source(content, rel_path))
                elif is_js:
                    results.append(parse_javascript_source(content, rel_path))
                elif is_go:
                    results.append(parse_go_source(content, rel_path))
                elif is_rs:
                    results.append(parse_rust_source(content, rel_path))
            except Exception:
                continue

    return results
