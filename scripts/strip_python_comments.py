#!/usr/bin/env python3
from __future__ import annotations

import ast
import io
import sys
import tokenize
from pathlib import Path

EXCLUDE_DIRS = {
    "__pycache__",
    ".git",
    "node_modules",
    ".next",
    ".venv",
    "venv",
    "bin",
    "obj",
}


def remove_hash_comments(source: str) -> str:
    out: list[str] = []
    last_lineno = -1
    last_col = 0

    for tok in tokenize.generate_tokens(io.StringIO(source).readline):
        token_type = tok.type
        token_string = tok.string
        start_line, start_col = tok.start
        end_line, end_col = tok.end

        if start_line > last_lineno:
            last_col = 0
        if start_col > last_col:
            out.append(" " * (start_col - last_col))

        if token_type not in (tokenize.COMMENT, tokenize.ENCODING):
            out.append(token_string)

        last_lineno = end_line
        last_col = end_col

    return tokenize.untokenize(out)


class DocstringRemover(ast.NodeTransformer):
    @staticmethod
    def _strip_docstring(body: list[ast.stmt]) -> list[ast.stmt]:
        if not body:
            return body
        first = body[0]
        if isinstance(first, ast.Expr):
            value = first.value
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                return body[1:]
        return body

    def visit_Module(self, node: ast.Module) -> ast.Module:
        self.generic_visit(node)
        node.body = self._strip_docstring(node.body)
        return node

    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.FunctionDef:
        self.generic_visit(node)
        node.body = self._strip_docstring(node.body)
        return node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> ast.AsyncFunctionDef:
        self.generic_visit(node)
        node.body = self._strip_docstring(node.body)
        return node

    def visit_ClassDef(self, node: ast.ClassDef) -> ast.ClassDef:
        self.generic_visit(node)
        node.body = self._strip_docstring(node.body)
        return node


def remove_docstrings(source: str) -> str:
    tree = ast.parse(source)
    tree = DocstringRemover().visit(tree)
    ast.fix_missing_locations(tree)
    return ast.unparse(tree)


def collapse_blank_lines(text: str) -> str:
    lines = text.splitlines()
    out: list[str] = []
    blank_run = 0
    for line in lines:
        if line.strip() == "":
            blank_run += 1
            if blank_run <= 1:
                out.append("")
        else:
            blank_run = 0
            out.append(line.rstrip())
    result = "\n".join(out).strip()
    return (result + "\n") if result else ""


def clean_python_source(source: str) -> str:
    without_comments = remove_hash_comments(source)
    without_docstrings = remove_docstrings(without_comments)
    return collapse_blank_lines(without_docstrings)


def iter_python_files(root: Path):
    for path in root.rglob("*.py"):
        if path.name == "strip_python_comments.py":
            continue
        if any(part in EXCLUDE_DIRS for part in path.parts):
            continue
        yield path


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(".").resolve()
    dry_run = "--dry-run" in sys.argv

    changed = skipped = errors = 0

    for filepath in sorted(iter_python_files(root)):
        try:
            original = filepath.read_text(encoding="utf-8")
            cleaned = clean_python_source(original)
        except SyntaxError as exc:
            print(f"[ERROR] {filepath}: syntax error during cleanup - {exc}")
            errors += 1
            continue
        except OSError as exc:
            print(f"[ERROR] {filepath}: {exc}")
            errors += 1
            continue

        if cleaned == original:
            skipped += 1
            continue

        rel = filepath.relative_to(root)
        delta = original.count("\n") - cleaned.count("\n")
        if dry_run:
            print(f"[DRY-RUN] {rel} ({delta} lines removed)")
        else:
            filepath.write_text(cleaned, encoding="utf-8", newline="\n")
            print(f"[OK] {rel} ({delta} lines removed)")
        changed += 1

    print("-" * 60)
    print(f"Modified: {changed}")
    print(f"Unchanged: {skipped}")
    print(f"Errors: {errors}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
