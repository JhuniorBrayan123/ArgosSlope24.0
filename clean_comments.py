#!/usr/bin/env python3
# clean_comments.py -- Elimina TODOS los comentarios y docstrings del backend.
#
# Archivos soportados:
#   - Python (.py): docstrings (triple-quote) y comentarios (#)
#   - C# (.cs): comentarios XML (///), de linea (//) y bloque (/* */)
#
# Uso:
#   python clean_comments.py              # procesa el backend (modo real)
#   python clean_comments.py --dry-run    # preview sin escribir
#   python clean_comments.py --path ruta  # directorio personalizado

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


# ---------- Python cleaner -------------------------------------------
# Regex que captura en orden:
#   1. Triple-double-quote strings
#   2. Triple-single-quote strings
#   3. String literal comun doble
#   4. String literal comun simple
#   5. Comentarios #

_PY_PATTERN = re.compile(
    r'"""[\s\S]*?"""'
    r"|'''[\s\S]*?'''"
    r'|"(?:[^"\\]|\\.)*"'
    r"|'(?:[^'\\]|\\.)*'"
    r"|#[^\n]*",
    re.MULTILINE,
)


def _py_replacer(m: re.Match) -> str:
    s = m.group(0)
    if s.startswith("#"):
        return ""
    if s.startswith('"""') or s.startswith("'''"):
        return ""
    return s


def clean_python(source: str) -> str:
    cleaned = _PY_PATTERN.sub(_py_replacer, source)
    return _collapse_blanks(cleaned)


# ---------- C# cleaner -----------------------------------------------

_CS_BLOCK  = re.compile(r"/\*.*?\*/", re.DOTALL)
_CS_XMLDOC = re.compile(r"^\s*///.*$", re.MULTILINE)
_CS_LINE   = re.compile(r"(?<!:)//.*$", re.MULTILINE)


def clean_csharp(source: str) -> str:
    source = _CS_BLOCK.sub("", source)
    source = _CS_XMLDOC.sub("", source)
    source = _CS_LINE.sub("", source)
    return _collapse_blanks(source)


# ---------- Shared ---------------------------------------------------

def _collapse_blanks(text: str) -> str:
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
            out.append(line)
    return "\n".join(out).strip() + "\n"


# ---------- File walker ----------------------------------------------

EXCLUDE_DIRS = {
    "bin", "obj", "__pycache__", ".git", ".vs",
    "node_modules", "migrations", "Migrations",
}

CLEANERS = {
    ".py": clean_python,
    ".cs": clean_csharp,
}


def iter_files(root: Path):
    for path in root.rglob("*"):
        if path.is_file() and path.suffix in CLEANERS:
            if not any(p in EXCLUDE_DIRS for p in path.parts):
                yield path


def process(root: Path, dry_run: bool) -> None:
    changed = skipped = errors = 0

    for filepath in sorted(iter_files(root)):
        try:
            original = filepath.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError) as exc:
            print(f"  [ERROR] {filepath.relative_to(root)} - {exc}")
            errors += 1
            continue

        cleaner = CLEANERS[filepath.suffix]
        cleaned = cleaner(original)

        if cleaned == original:
            skipped += 1
            continue

        rel = filepath.relative_to(root)
        removed = original.count("\n") - cleaned.count("\n")

        if dry_run:
            print(f"  [DRY-RUN] {rel}  ({removed} lineas eliminadas)")
        else:
            filepath.write_text(cleaned, encoding="utf-8")
            print(f"  [OK]  {rel}  ({removed} lineas eliminadas)")

        changed += 1

    print()
    print("-" * 60)
    print(f"  Archivos modificados : {changed}")
    print(f"  Archivos sin cambios : {skipped}")
    print(f"  Errores              : {errors}")
    if dry_run:
        print("  Modo DRY-RUN - ningun archivo fue escrito.")
    print("-" * 60)


# ---------- Entry point ----------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Elimina comentarios y docstrings del backend (Python + C#)."
    )
    parser.add_argument(
        "--path",
        default=".",
        help="Directorio raiz del backend (default: directorio actual)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo muestra que cambiaria, no escribe archivos.",
    )
    args = parser.parse_args()

    root = Path(args.path).resolve()
    if not root.is_dir():
        print(f"Error: '{root}' no es un directorio valido.", file=sys.stderr)
        sys.exit(1)

    mode = "DRY-RUN (preview)" if args.dry_run else "REAL (escribe archivos)"
    print(f"\nArgosSlope 4.0 - Limpieza de comentarios")
    print(f"  Directorio : {root}")
    print(f"  Modo       : {mode}")
    print(f"  Extensiones: .py, .cs")
    print()

    process(root, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
