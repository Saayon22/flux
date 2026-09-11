"""
Tree-sitter AST parsing service.
Parses Python and JavaScript/TypeScript source code to extract imports, functions, classes, and calls.
"""

import os
from pathlib import Path
from typing import List, Optional, Set, Dict, Any

from tree_sitter import Language, Parser
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript

from models.graph import CodeSymbol, FileParseResult

# Initialize Tree-sitter parsers for Python and JavaScript
PY_LANGUAGE = Language(tspython.language())
py_parser = Parser(PY_LANGUAGE)

JS_LANGUAGE = Language(tsjavascript.language())
js_parser = Parser(JS_LANGUAGE)

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
}

# Recognized file extensions by language
PYTHON_EXTENSIONS: Set[str] = {".py"}
JAVASCRIPT_EXTENSIONS: Set[str] = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}


def _extract_python_docstring(body_node, source_bytes: bytes) -> Optional[str]:
    """
    Extracts the docstring of a Python function or class if the first statement is a string literal.
    """
    if not body_node or not body_node.children:
        return None
    for child in body_node.children:
        if child.type == "expression_statement":
            for expr in child.children:
                if expr.type == "string":
                    raw = expr.text.decode("utf-8", errors="replace")
                    # Strip quotes (triple or single)
                    return raw.strip("\"'").strip()
        elif child.type not in ("comment", "\n", ""):
            break
    return None


def parse_python_source(code_str: str, rel_path: str) -> FileParseResult:
    """
    Parses Python source code into AST using Tree-sitter.
    Extracts:
    - Imports (from import_statement and import_from_statement)
    - Functions (name, start/end lines, docstrings)
    - Classes (name, start/end lines, methods)
    
    Args:
        code_str: Raw Python source code string.
        rel_path: Normalized relative path within repository.
        
    Returns:
        FileParseResult containing extracted metadata and symbols.
    """
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = py_parser.parse(code_bytes)
    root = tree.root_node

    imports: List[str] = []
    symbols: List[CodeSymbol] = []
    line_count = len(code_str.splitlines())

    def visit_node(node, parent_class: Optional[str] = None):
        # 1. Handle import statements: `import foo, bar as b`
        if node.type == "import_statement":
            for child in node.children:
                if child.type == "dotted_name":
                    imports.append(child.text.decode("utf-8", errors="replace"))
                elif child.type == "aliased_import":
                    name_child = child.child_by_field_name("name")
                    if name_child:
                        imports.append(name_child.text.decode("utf-8", errors="replace"))

        # 2. Handle from-import statements: `from foo.bar import baz`
        elif node.type == "import_from_statement":
            module_node = node.child_by_field_name("module_name")
            if module_node:
                module_text = module_node.text.decode("utf-8", errors="replace")
                imports.append(module_text)
            else:
                # Relative imports e.g. `from . import utils` or `from ..models import database`
                raw_text = node.text.decode("utf-8", errors="replace")
                if "import" in raw_text:
                    parts = raw_text.split("import")[0].replace("from", "").strip()
                    if parts:
                        imports.append(parts)

        # 3. Handle function definitions: `def my_func(): ...`
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

        # 4. Handle class definitions: `class MyClass: ...`
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

                # Recursively parse methods inside the class body
                if body_node:
                    for body_child in body_node.children:
                        visit_node(body_child, parent_class=class_name)
                    return  # already visited children

        # Visit child nodes
        for child in node.children:
            visit_node(child, parent_class)

    visit_node(root)

    return FileParseResult(
        file_path=rel_path,
        language="python",
        imports=list(dict.fromkeys(imports)),  # deduplicate preserving order
        symbols=symbols,
        line_count=line_count,
    )


def parse_javascript_source(code_str: str, rel_path: str) -> FileParseResult:
    """
    Parses JavaScript/TypeScript source code into AST using Tree-sitter.
    Extracts:
    - Imports (`import ... from '...'` and `require('...')`)
    - Functions (function declarations, arrow functions, methods)
    - Classes (class declarations)
    
    Args:
        code_str: Raw JS/TS source code string.
        rel_path: Normalized relative path within repository.
        
    Returns:
        FileParseResult containing extracted metadata and symbols.
    """
    code_bytes = code_str.encode("utf-8", errors="replace")
    tree = js_parser.parse(code_bytes)
    root = tree.root_node

    imports: List[str] = []
    symbols: List[CodeSymbol] = []
    line_count = len(code_str.splitlines())

    def clean_quotes(text: str) -> str:
        return text.strip("\"'`")

    def visit_node(node, parent_class: Optional[str] = None):
        # 1. Handle ES6 import statement: `import x from './module'`
        if node.type == "import_statement":
            source_node = node.child_by_field_name("source")
            if source_node:
                module_path = clean_quotes(source_node.text.decode("utf-8", errors="replace"))
                imports.append(module_path)

        # 2. Handle CommonJS require: `const x = require('./module')`
        elif node.type == "call_expression":
            fn_node = node.child_by_field_name("function")
            if fn_node and fn_node.text.decode("utf-8", errors="replace") == "require":
                args_node = node.child_by_field_name("arguments")
                if args_node and args_node.children:
                    for arg in args_node.children:
                        if arg.type == "string":
                            module_path = clean_quotes(arg.text.decode("utf-8", errors="replace"))
                            imports.append(module_path)

        # 3. Handle function declarations: `function myFunc() {}`
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

        # 4. Handle variable declarations with arrow functions: `const myFunc = () => {}`
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

        # 5. Handle class declarations: `class MyClass {}`
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
                    return  # already traversed class body

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


def parse_repository(repo_dir: Path) -> List[FileParseResult]:
    """
    Traverses a repository directory, filters for source files (Python, JS, TS),
    parses each with Tree-sitter, and returns structural analysis results.
    
    Args:
        repo_dir: Path to the local repository directory.
        
    Returns:
        List of FileParseResult for each successfully parsed source file.
    """
    results: List[FileParseResult] = []

    for root, dirs, files in os.walk(repo_dir):
        # Prune ignored directories in-place
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRECTORIES and not d.startswith(".")]

        for file_name in files:
            file_path = Path(root) / file_name
            ext = file_path.suffix.lower()

            if ext not in PYTHON_EXTENSIONS and ext not in JAVASCRIPT_EXTENSIONS:
                continue

            # Compute relative path normalized with forward slashes
            rel_path = file_path.relative_to(repo_dir).as_posix()

            try:
                content = file_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue

            try:
                if ext in PYTHON_EXTENSIONS:
                    parsed = parse_python_source(content, rel_path)
                else:
                    parsed = parse_javascript_source(content, rel_path)
                results.append(parsed)
            except Exception as e:
                # Log or skip individual corrupted files safely
                print(f"[WARN] Failed to parse {rel_path} with Tree-sitter: {e}")
                continue

    return results
