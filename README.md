# CompileCraft

> **A Multi-Language Compiler Front-End for C, C++, and Java Subsets**
> **Current focus**: baseline `.mc` through **M7 TAC**, plus **M9 C front-end** (`compilecraft-c`). Next: **M8** unified CLI; C++ / Java parsers still pending.

---

## 1. Project Overview

**CompileCraft** is a modular compiler **front-end** developed in **C**, **Flex**, and **Bison**. It targets:

- A **baseline mini-language** (`.mc`) with a full lexer → parser → AST path.
- Distinct **C**, **C++**, and **Java** language subsets through separate front ends that currently provide **lexers only**.

The long-term design shares AST, symbol-table, and Three-Address Code (TAC) infrastructure across languages. There is **no backend codegen**; the intended pipeline ends at TAC.

**Implemented today (through Milestone 9 / C front-end):**

- Four standalone Flex lexers (baseline, C, C++, Java).
- Hardened baseline Bison parser (detailed diagnostics, recovery, zero-conflict build gate).
- Baseline AST core under `src/ast/`, wired into the parser with source locations, ownership rules, and structural regression suites.
- Scoped symbol table (`src/symbol_table/`) and semantic analyzer (`src/semantic/`) with faculty-rule goldens.
- TAC generator (`src/tac/`) with unit tests, semantic-gated integration driver (`compilecraft-tac.exe`), and golden suite including the Section 5.5 sample.
- **C front-end** (`C_Compiler/`): Bison parser + `bin/compilecraft-c.exe` pipeline to shared AST → semantic → TAC, including `for` (lowered to while) and `++`/`--`.
- Production parser CLI with optional `--ast` output.

**Not yet implemented:** Unified `compilecraft` CLI (M8), C++ / Java parsers, and final DEC-07 short-circuit policy for `&&` / `||`.

---

## 2. Compiler Pipeline

### Baseline mini-language (`.mc`) — current path

```
Lexer → Parser → AST → Symbol Table → Semantic Analysis → TAC
 DONE    DONE    DONE       DONE             DONE          DONE
```

### Multi-language target architecture

```
  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
  │   C Source (.c)  │    │ C++ Source (.cpp)  │    │  Java Source (.java)│
  └────────┬─────────┘    └─────────┬──────────┘    └──────────┬──────────┘
           │                        │                          │
           ▼                        ▼                          ▼
  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
  │  C Front-End     │    │   C++ Front-End    │    │   Java Front-End    │
  │  - Lexer (DONE)  │    │   - Lexer (DONE)   │    │   - Lexer (DONE)    │
  │  - Parser (DONE) │    │   - Parser (PLAN)  │    │   - Parser (PLAN)   │
  │  - Shared AST    │    │   - AST (PLAN)     │    │   - AST (PLAN)      │
  └────────┬─────────┘    └─────────┬──────────┘    └──────────┬──────────┘
           │                        │                          │
           └───────────────────┐    │    ┌─────────────────────┘
                               ▼    ▼    ▼
                    ┌──────────────────────────────┐
                    │ Shared Core (AST/sym/TAC)    │
                    │ DONE for .mc + C (M5–M7/M9)  │
                    └──────────────────────────────┘
```

**Baseline AST today** lives under `src/ast/` (not yet a multi-language `src/common/ast/`). TAC docs: `docs/tac.md`.

### Out-of-scope boundaries

Backend machine code generation, assembly, linking, register allocation, and executable emission are out of scope. The pipeline is intended to terminate at TAC.

---

## 3. Technology Stack & Verified Toolchain

CompileCraft uses the 64-bit MSYS2 toolchain at `E:\msys64`:

| Component | Selected Tool | Verified Version | Resolved Path |
|---|---|---|---|
| **Programming Language** | C (C11) | ISO C Standard | Standard C Library |
| **C Compiler** | GCC (MSYS2 UCRT64) | 16.2.0 | `E:\msys64\ucrt64\bin\gcc.exe` |
| **Lexer Generator** | Flex | 2.6.4 | `E:\msys64\usr\bin\flex.exe` |
| **Parser Generator** | Bison | 3.8.2 | `E:\msys64\usr\bin\bison.exe` |
| **Build Automation** | GNU Make | 4.4.1 | `E:\msys64\ucrt64\bin\mingw32-make.exe` |
| **Test Runner** | Python | 3.14.7 | `python` on `PATH` |
| **Version Control** | Git | 2.43.0 | `C:\Program Files\Git\cmd\git.exe` |

> **Note:** Legacy 32-bit binaries under `E:\mingw32\msys\1.0\bin` are unsuitable on modern Windows. The Makefile targets the verified 64-bit tools in `E:\msys64`.

**AddressSanitizer** is **not** available on this MSYS2 UCRT64 install (`-lasan` missing). Ownership is reviewed statically and covered by regression / unit tests; ASAN verification is **not** claimed.

---

## 4. Implementation Status

> **Status**: **Milestone 4.5 — Documentation Synchronization (complete on `dev`)**
> *Baseline lexer + hardened parser + AST construction + root ownership + `--ast` + production goldens + docs sync.*

### Status matrix

| Module / Component | Description | Status | Notes |
|---|---|:---:|---|
| **Environment & Toolchain** | MSYS2 GCC, Flex, Bison, Make, Python | **COMPLETED** | Verified via `toolchain-check`. |
| **Build Foundation** | Modular `Makefile` | **COMPLETED** | Lexers, parser, AST harnesses, ownership test, `test-ast`; Bison `-Werror=conflicts-*`. |
| **Requirements / Decisions / Roadmap** | Spec docs | **COMPLETED** | See `docs/` (synced through M4.5). |
| **Baseline Lexer (`src/lexer/`)** | Flex scanner + driver | **COMPLETED** | 18 tests. |
| **C / C++ / Java Lexers** | Subset scanners | **COMPLETED** | 25 + 24 + 20 tests. **Parsers not started.** |
| **Baseline Parser (`src/parser/`)** | Bison LALR(1) + recovery | **COMPLETED (M3.2–M3.3)** | 34 syntax tests. See `docs/parser.md`. |
| **AST Core (`src/ast/`)** | Nodes, constructors, lists, `ast_free`, `ast_print` | **COMPLETED (M4.0–M4.1)** | Design: `docs/ast.md`. |
| **AST ↔ Parser Integration** | Locations, `%union`, destructors, construction | **COMPLETED (M4.2–M4.2.7)** | Expr / program suites + ownership unit test. |
| **AST Root + `--ast` CLI** | Production handoff and dump | **COMPLETED (M4.3.1–M4.3.2)** | See CLI section below. |
| **Production `tests/ast/` goldens** | Parser `--ast` golden suite | **COMPLETED (M4.4)** | 14 cases; `mingw32-make test-ast`. |
| **Docs sync** | README + AST/parser/roadmap notes | **COMPLETED (M4.5)** | |
| **Symbol Table (`src/symbol_table/`)** | Scoped symbols & hierarchy | **COMPLETED (M5)** | Scoped frames, shadowing, isolation, unit tests. |
| **Semantic Analysis (`src/semantic/`)** | Type & semantic rule checks | **COMPLETED (M6)** | 6 faculty rules, 26 regression tests (`bin/compilecraft-semantic.exe`). |
| **TAC (`src/tac/`)** | Three-Address Code generation | **COMPLETED (M7)** | Semantic-gated driver, unit + golden suites (incl. Sec 5.5); DEC-07 interim eager `&&`/`\|\|`. |
| **C front-end (`C_Compiler/`)** | C subset parse → TAC | **COMPLETED (M9)** | `compilecraft-c.exe`; for-loops; tests under `tests/c/{parser,semantic,tac}/`. |
| **Unified CLI (`compilecraft`)** | Multi-phase driver | **PENDING (M8)** | Still pending. |
| **C++ / Java parsers** | Language front ends | **PENDING** | Lexers only. |

### Milestone summary (M4)

| Milestone | Deliverable | Status |
|---|---|---|
| **M4.0** | AST design (`docs/ast.md`) | Done |
| **M4.1** | AST core (`src/ast/ast.h`, `ast.c`) | Done |
| **M4.2.2–M4.2.4** | Build wiring, `%locations`, `%union` / destructors | Done |
| **M4.2.5** | Expression AST + `tests/expr_ast/` (30) | Done |
| **M4.2.6** | Statement / program AST + `tests/program_ast/` (25) | Done |
| **M4.2.7** | List ownership safeguards + unit test | Done |
| **M4.3.1** | `compilecraft_ast_root` handoff to driver | Done |
| **M4.3.2** | Production `--ast` CLI | Done |
| **M4.4** | Production `tests/ast/` goldens + `test-ast` | Done |
| **M4.5** | Documentation synchronization | Done |

---

## 5. Abstract Syntax Tree (baseline `.mc`)

Design authority: `docs/ast.md`. Implementation: `src/ast/`.

### Node kinds

`AST_PROGRAM`, `AST_BLOCK`, `AST_VAR_DECL`, `AST_ASSIGN`, `AST_EXPR_STMT`, `AST_EMPTY_STMT`, `AST_IF`, `AST_WHILE`, `AST_PRINT`, `AST_BINARY_OP`, `AST_UNARY_OP`, `AST_IDENTIFIER`, `AST_LITERAL`.

### Construction and printing

- Constructors take ownership of required children / identifier strings; on failure they free would-be children and return `NULL`.
- Statement lists use head/tail helpers (`ast_list_append`) with an internal `in_stmt_list` membership flag to reject cross-list / duplicate appends.
- `ast_free` recursively frees a node, its owned children, and the sibling `next` chain.
- `ast_print` / `ast_print_indent` emit deterministic indented text (used by AST harnesses and `--ast`).

### Parser integration

- Bison `%locations` with Flex `YY_USER_ACTION` (parser-linked build only): 1-based inclusive line/column spans.
- Extended `%union` (`ival` / `fval` / `bval` / `sval` + `AstNode *` / `AstTypeTag` / `AstList`).
- `%destructor` for discarded `<sval>`, `<node>`, and `<list>` values during error recovery / unwind.
- Successful `program` reduction builds `AST_PROGRAM`, stores it in `compilecraft_ast_root`, and sets start-symbol `$$` to `NULL` so Bison never double-owns the live root.
- The production driver frees the root exactly once after `yyparse`.

Expression-capture hooks remain **test-only** for `tests/expr_ast/` and are disabled in the production CLI. Retired program-capture hooks are **not** part of the public API.

---

## 6. Parser CLI

Artifact: `bin/compilecraft-parser.exe`

```powershell
# Default: syntax validation only
.\bin\compilecraft-parser.exe <source-file>

# AST dump (flag before or after the path)
.\bin\compilecraft-parser.exe --ast <source-file>
.\bin\compilecraft-parser.exe <source-file> --ast
```

| Mode | On clean success | On lexical / syntax errors |
|---|---|---|
| **Default** | Prints `Syntax validation successful.` | Diagnostics on stderr; exit `1`; no AST dump |
| **`--ast`** | Prints the program tree via `ast_print` only (no success banner) | Diagnostics; exit `1`; no AST dump |

Clean success requires `yyparse() == 0` **and** zero `syntax_error_count` / `lexical_error_count`. Recovered parses with errors are not treated as successful AST dumps.

Unknown flags, missing paths, and multiple source files print usage to stderr and exit `1`.

---

## 7. Directory Structure

Reflects the repository as of M4.5 (planned paths that do not exist yet are omitted).

```
CompileCraft/
├── .gitignore
├── README.md
├── Makefile
├── docs/
│   ├── ast.md                   # AST design + implemented status (M4)
│   ├── requirements.md
│   ├── roadmap.md
│   ├── decisions.md
│   ├── grammar.md
│   ├── parser.md                # Baseline parser + AST wiring notes
│   ├── tokens.md
│   ├── tokens_c.md
│   ├── tokens_cpp.md
│   └── tokens_java.md
├── C_Compiler/                  # C-subset lexer (parser not started)
├── CPP_Compiler/                # C++-subset lexer (parser not started)
├── Java_Compiler/               # Java-subset lexer (parser not started)
├── src/
│   ├── ast/                     # [M4] AST core
│   │   ├── ast.h
│   │   └── ast.c
│   ├── lexer/                   # Baseline lexer
│   │   ├── tokens.def
│   │   ├── tokens.h / tokens.c
│   │   ├── lexer.l
│   │   └── main.c
│   └── parser/                  # Baseline parser + AST wiring + CLI
│       ├── parser.y
│       ├── parser.h
│       └── main.c
└── tests/
    ├── run_tests.py
    ├── lexer/                   # 18
    ├── c/                       # 25
    ├── cpp/                     # 24
    ├── java/                    # 20
    ├── parser/                  # 34
    ├── expr_ast/                # 30 (structural; harness binary)
    ├── program_ast/             # 25 (structural; harness binary)
    ├── ast/                     # 14 (production --ast goldens)
    └── ast_ownership/           # list-ownership unit test
```

Generated outputs (`bin/`, `build/`, Flex/Bison intermediates) are gitignored.

---

## 8. Build and Verification

### 8.1 Toolchain check

```powershell
& "E:\msys64\ucrt64\bin\mingw32-make.exe" toolchain-check
```

### 8.2 Build

```powershell
& "E:\msys64\ucrt64\bin\mingw32-make.exe" all

# Individual targets:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer-c
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer-cpp
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer-java
& "E:\msys64\ucrt64\bin\mingw32-make.exe" parser
```

Builds also produce AST harnesses and the ownership unit test:

- `bin/compilecraft-expr-ast.exe`
- `bin/compilecraft-program-ast.exe`
- `bin/test-ast-list-ownership.exe`

### 8.3 Regression tests

Verified coverage:

| Suite | Cases |
|---|---:|
| Baseline lexer | 18 |
| C lexer | 25 |
| C++ lexer | 24 |
| Java lexer | 20 |
| Parser | 34 |
| Expression AST | 30 |
| Program AST | 25 |
| Production AST (`--ast`) | 14 |
| **Total (golden suites)** | **190** |
| AST list ownership unit test | PASS (separate binary) |

```powershell
# All suites (190 goldens + ownership unit test):
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test

# Individual suites:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-lexer
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-c
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-cpp
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-java
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-parser
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-expr-ast
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-program-ast
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-ast
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-ast-ownership
```

Bison builds fail on unresolved shift/reduce or reduce/reduce conflicts (`-Werror=conflicts-sr -Werror=conflicts-rr`).

---

## 9. Remaining Work

| Milestone | Focus |
|---|---|
| **M5** | Scoped symbol table |
| **M6** | Semantic analysis |
| **M7** | Three-Address Code |
| **M8** | Unified multi-language CLI driver |

C / C++ / Java **parsers** and language-specific ASTs remain future work; only their **lexers** are complete.
