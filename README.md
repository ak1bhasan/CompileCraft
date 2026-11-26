# CompileCraft

> **A Multi-Language Compiler Front-End for C, C++, and Java Subsets**
> **Current focus**: baseline `.mc` (**M0–M7**), **M9 C**, **M10 C++**, **M11 Java**, **M12 Hardening**, **M8 Unified CLI (`compilecraft.exe`)**, and **M13 Frontend–Compiler Integration (`frontend/` Electron IDE)**. Remaining: **M14** final docs & verification.

---

## 1. Project Overview

**CompileCraft** is a modular compiler **front-end** developed in **C**, **Flex**, and **Bison**. It targets:

- A **baseline mini-language** (`.mc`) through the complete `Lexer → Parser → AST → Symbol Table → Semantic Analysis → TAC` pipeline.
- Bounded procedural/entry-wrapper subsets of **C** (`C_Compiler/`), **C++** (`CPP_Compiler/`), and **Java** (`Java_Compiler/`), each compiled through its own Flex lexer and Bison parser into the shared AST, symbol table, semantic analyzer, and TAC generator. *(These front ends support documented language subsets, not full ISO C, C++, or Java specifications.)*

There is **no backend codegen**; the pipeline terminates at Three-Address Code (TAC).

**Implemented today (through Milestone 13):**

- **Unified CLI (`src/main.c` → `bin/compilecraft.exe`)**: Extension-based dispatch for C (`.c`), C++ (`.cpp`), and Java (`.java`), `--help` / `--tokens` / `--ast` / `--symtab` flags, safe native process invocation (no shell), and reliable path resolution from outside the repo or paths with spaces. *(Baseline `.mc` remains supported through its dedicated drivers `compilecraft-{lexer,parser,semantic,tac}.exe`.)*
- **Electron + React Desktop IDE (`frontend/`)**: Monaco-based IDE connected via a hardened Electron IPC host (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `child_process.spawn` without shell) to `bin/compilecraft.exe` for C, C++, and Java, displaying real **Tokens**, **AST**, **Symbol Table**, **TAC**, and line-numbered **Errors**.
- Four standalone Flex lexers (baseline `.mc`, C, C++, Java).
- Hardened baseline `.mc` Bison parser (`src/parser/`), AST core (`src/ast/`), scoped symbol table (`src/symbol_table/`), six-rule semantic analyzer (`src/semantic/`), and TAC generator (`src/tac/`).
- **C front-end** (`C_Compiler/`): `Flex → Bison → Shared AST → Semantic Analysis → TAC` (`bin/compilecraft-c.exe`), supporting `int`, `float`, `_Bool`/`bool`, `true`/`false`, `if`/`if-else`, `while`, `for`, `++`/`--`, and all six faculty semantic rules.
- **C++ front-end** (`CPP_Compiler/`): `Flex → Bison → Shared AST → Semantic Analysis → TAC` (`bin/compilecraft-cpp.exe`), supporting `int`, `float`, `bool`, `true`/`false`, `if`/`if-else`, `while`, `for`, `++`/`--`, and all six faculty semantic rules.
- **Java front-end** (`Java_Compiler/`): `Flex → Bison → Shared AST → Semantic Analysis → TAC` (`bin/compilecraft-java.exe`), supporting `[public] class <Name> { public static void main(String[] args) { ... } }`, `int`, `float`, `boolean`, `true`/`false`, `if`/`if-else`, `while`, `for`, `++`/`--`, and all six faculty semantic rules.
- Production parser and language compiler CLIs with optional `--ast` and `--symtab` output.

**Remaining / Not yet implemented:** Desktop installer packaging (Electron bundler configuration), final documentation & faculty verification (**M14**), final **DEC-07** short-circuit policy for `&&` / `||`, and unsupported constructs documented per language.

---

## 2. Compiler Pipeline

### Baseline mini-language (`.mc`)

```
Lexer → Parser → AST → Symbol Table → Semantic Analysis → TAC
 DONE    DONE    DONE       DONE             DONE          DONE
```

### Multi-language front-end pipelines (bounded subsets)

```
- Baseline .mc : Lexer → Parser → AST → Symbol Table → Semantic Analysis → TAC
- C            : Flex → Bison → Shared AST → Semantic Analysis → TAC
- C++          : Flex → Bison → Shared AST → Semantic Analysis → TAC
- Java         : Flex → Bison → Shared AST → Semantic Analysis → TAC
```

```
  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
  │   C Source (.c)  │    │ C++ Source (.cpp)  │    │  Java Source (.java)│
  └────────┬─────────┘    └─────────┬──────────┘    └──────────┬──────────┘
           │                        │                          │
           ▼                        ▼                          ▼
  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
  │  C Front-End     │    │   C++ Front-End    │    │   Java Front-End    │
  │  - Flex (DONE)   │    │   - Flex (DONE)    │    │   - Flex (DONE)     │
  │  - Bison (DONE)  │    │   - Bison (DONE)   │    │   - Bison (DONE)    │
  │  - Shared AST    │    │   - Shared AST     │    │   - Shared AST      │
  └────────┬─────────┘    └─────────┬──────────┘    └──────────┬──────────┘
           │                        │                          │
           └───────────────────┐    │    ┌─────────────────────┘
                               ▼    ▼    ▼
                    ┌───────────────────────────────────┐
                    │ Shared Core (AST / Symtab / Sem / │
                    │ TAC) — DONE (.mc, C, C++, Java)   │
                    └───────────────────────────────────┘
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

> **Status**: **Milestone 13 — Frontend–Compiler Integration (complete on `dev`, pending commit)**
> *Electron + React + Monaco IDE wired cleanly to `bin/compilecraft.exe` for C, C++, and Java.*

### Status matrix

| Module / Component | Description | Status | Notes |
|---|---|:---:|---|
| **Environment & Toolchain** | MSYS2 GCC, Flex, Bison, Make, Python | **COMPLETED** | Verified via `toolchain-check`. |
| **Build Foundation** | Modular `Makefile` | **COMPLETED** | All lexers, parsers, AST/symtab/semantic/TAC targets, C/C++/Java front ends; Bison `-Werror=conflicts-*`. |
| **Requirements / Decisions / Roadmap** | Spec docs | **COMPLETED** | See `docs/` (synced through M13). |
| **Baseline Lexer (`src/lexer/`)** | Flex scanner + driver | **COMPLETED** | 18 tests. |
| **C / C++ / Java Lexers** | Subset scanners | **COMPLETED** | 27 + 24 + 20 tests. C/C++/Java parsers done (M9/M10/M11/M12). |
| **Baseline Parser (`src/parser/`)** | Bison LALR(1) + recovery | **COMPLETED (M3.2–M3.3)** | 34 syntax tests. See `docs/parser.md`. |
| **AST Core (`src/ast/`)** | Nodes, constructors, lists, `ast_free`, `ast_print` | **COMPLETED (M4.0–M4.1)** | Design: `docs/ast.md`. |
| **AST ↔ Parser Integration** | Locations, `%union`, destructors, construction | **COMPLETED (M4.2–M4.2.7)** | Expr / program suites + ownership unit test. |
| **AST Root + `--ast` CLI** | Production handoff and dump | **COMPLETED (M4.3.1–M4.3.2)** | See CLI section below. |
| **Production `tests/ast/` goldens** | Parser `--ast` golden suite | **COMPLETED (M4.4)** | 14 cases; `mingw32-make test-ast`. |
| **Symbol Table (`src/symbol_table/`)** | Scoped symbols & hierarchy | **COMPLETED (M5)** | Scoped frames, shadowing, isolation, unit-test executable. |
| **Semantic Analysis (`src/semantic/`)** | Type & semantic rule checks | **COMPLETED (M6)** | 6 faculty rules, 26 regression tests (`bin/compilecraft-semantic.exe`). |
| **TAC (`src/tac/`)** | Three-Address Code generation | **COMPLETED (M7)** | Semantic-gated driver, unit-test executable + 16 golden cases; DEC-07 interim eager `&&`/`\|\|`. |
| **C front-end (`C_Compiler/`)** | C subset parse → TAC | **COMPLETED (M9/M12)** | `compilecraft-c.exe`; `_Bool`/`bool`; for-loops; all 6 faculty rules + TAC under `tests/c/{parser,semantic,tac}/`. |
| **C++ front-end (`CPP_Compiler/`)** | C++ subset parse → TAC | **COMPLETED (M10/M12)** | `compilecraft-cpp.exe`; `bool`; for-loops; all 6 faculty rules + TAC under `tests/cpp/{parser,semantic,tac}/`. |
| **Java front-end (`Java_Compiler/`)** | Java subset parse → TAC | **COMPLETED (M11/M12)** | `compilecraft-java.exe`; `class`/`main` wrapper; `boolean`; for-loops; all 6 faculty rules + TAC under `tests/java/{parser,semantic,tac}/`. |
| **Unified CLI (`src/main.c`)** | Extension-dispatching CLI driver | **COMPLETED (M8/M13)** | `bin/compilecraft.exe` dispatching `.c`, `.cpp`, `.java` with `--tokens`, `--ast`, `--symtab` (`tests/cli/`: 33 cases). |
| **Frontend–Compiler Integration** | Electron + React + Monaco IDE | **COMPLETED (M13)** | `frontend/electron/main.cjs` + `preload.cjs` invoking `bin/compilecraft.exe` for C, C++, Java (desktop installer packaging pending). |
| **Final Docs & Faculty Verification** | Final release verification | **PENDING (M14)** | Planned final milestone. |

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

## 6. Unified CLI & Parser CLI

### Unified Multi-Language CLI (`bin/compilecraft.exe`)

```powershell
.\bin\compilecraft.exe program.c
.\bin\compilecraft.exe program.cpp
.\bin\compilecraft.exe Main.java
.\bin\compilecraft.exe --ast Main.java
.\bin\compilecraft.exe --help
```

- Supports **C (`.c`)**, **C++ (`.cpp`)**, and **Java (`.java`)** only; automatically selects the matching compiler pipeline by extension, passes `--ast` when requested, invokes the resolved sibling binary via OS process APIs (no shell), emits TAC (or AST with `--ast`) on success (`exit 0`), and suppresses TAC on any lexical, syntax, semantic, or CLI error (`exit 1`). Baseline `.mc` remains served by `bin/compilecraft-{lexer,parser,semantic,tac}.exe`.

### Baseline Parser CLI (`bin/compilecraft-parser.exe`)

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

Reflects the repository as of Milestone 13 (planned installer packaging / unbuilt targets are omitted).

```
CompileCraft/
├── .gitignore
├── README.md
├── Makefile
├── docs/
│   ├── ast.md                   # AST design + implemented status (M4)
│   ├── c_frontend.md            # C front-end subset & Rule 4/5 notes (M9/M12)
│   ├── cpp_frontend.md          # C++ front-end subset notes (M10)
│   ├── java_frontend.md         # Java front-end subset notes (M11)
│   ├── requirements.md
│   ├── roadmap.md
│   ├── decisions.md
│   ├── grammar.md
│   ├── parser.md                # Baseline parser + AST wiring notes
│   ├── symbol_table.md          # Scoped symbol table specification
│   ├── semantic_analysis.md     # Six faculty semantic rules specification
│   ├── tac.md                   # TAC IR & DEC-07 interim policy
│   ├── tokens.md
│   ├── tokens_c.md
│   ├── tokens_cpp.md
│   └── tokens_java.md
├── C_Compiler/                  # C-subset lexer + Bison parser + driver (M2.1/M9/M12)
├── CPP_Compiler/                # C++-subset lexer + Bison parser + driver (M2.2/M10)
├── Java_Compiler/               # Java-subset lexer + Bison parser + driver (M2.3/M11)
├── frontend/                    # [M13] Electron + React + Vite + Monaco IDE
│   ├── electron/
│   │   ├── main.cjs             # Hardened IPC process host (shell: false)
│   │   └── preload.cjs          # Restricted contextBridge API
│   └── src/
│       ├── app/                 # Top-level IDE state & compiler orchestration
│       ├── components/          # TopBar, Sidebar, Workspace, StatusBar, dialogs
│       ├── data/                # C, C++, and Java IDE demonstration sources
│       ├── features/            # Monaco editor, Tokens, AST, Symbol Table, TAC, Errors
│       ├── services/            # Typed IPC compiler service wrapper
│       └── types/               # Shared IDE & compile result interfaces
├── src/
│   ├── main.c                   # [M8/M13] Unified multi-language CLI dispatcher
│   ├── ast/                     # [M4] Shared AST core
│   ├── lexer/                   # Baseline .mc lexer
│   ├── parser/                  # Baseline .mc parser + AST wiring + CLI
│   ├── symbol_table/            # [M5] Shared scoped symbol table
│   ├── semantic/                # [M6] Shared semantic analyzer
│   └── tac/                     # [M7] Shared Three-Address Code generator
└── tests/
    ├── run_tests.py
    ├── cli/                     # 33 unified CLI integration & error tests (M8/M13)
    ├── lexer/                   # 18
    ├── c/                       # 27 lexer + parser/ (22) + semantic/ (10) + tac/ (11)
    ├── cpp/                     # 24 lexer + parser/ (30) + semantic/ (9)  + tac/ (15)
    ├── java/                    # 20 lexer + parser/ (33) + semantic/ (9)  + tac/ (15)
    ├── parser/                  # 34
    ├── expr_ast/                # 30 (structural; harness binary)
    ├── program_ast/             # 25 (structural; harness binary)
    ├── ast/                     # 14 (production --ast goldens)
    ├── ast_ownership/           # AST list-ownership unit-test executable
    ├── symbol_table/            # Symbol table unit-test executable
    ├── semantic/                # 26
    └── tac/                     # TAC unit-test executable + golden/ (16)
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

# Individual compiler/lexer targets:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" cli
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer-c lexer-cpp lexer-java
& "E:\msys64\ucrt64\bin\mingw32-make.exe" parser
& "E:\msys64\ucrt64\bin\mingw32-make.exe" c-compiler cpp-compiler java-compiler
```

Builds also produce `bin/compilecraft.exe`, `bin/compilecraft-semantic.exe`, `bin/compilecraft-tac.exe`, AST harnesses, and three standalone C unit-test executables (`bin/test-ast-list-ownership.exe`, `bin/test-symbol-table.exe`, `bin/test-tac.exe`).

### 8.3 Regression tests

| Suite | Passed |
|---|---:|
| Automated regression (20 suites) | 421/421 |
| Unit-test executables | 3/3 |

Breakdown of the **421/421** automated regression cases:

| Suite | Cases |
|---|---:|
| Baseline lexer (`tests/lexer`) | 18 |
| C lexer (`tests/c`) | 27 |
| C++ lexer (`tests/cpp`) | 24 |
| Java lexer (`tests/java`) | 20 |
| Baseline parser (`tests/parser`) | 34 |
| Expression AST (`tests/expr_ast`) | 30 |
| Program AST (`tests/program_ast`) | 25 |
| Production AST (`tests/ast`) | 14 |
| Semantic analyzer (`tests/semantic`) | 26 |
| TAC golden (`tests/tac/golden`) | 16 |
| C parser / semantic / TAC (`tests/c/{parser,semantic,tac}`) | 22 + 10 + 11 |
| C++ parser / semantic / TAC (`tests/cpp/{parser,semantic,tac}`) | 30 + 9 + 15 |
| Java parser / semantic / TAC (`tests/java/{parser,semantic,tac}`) | 33 + 9 + 15 |
| Unified CLI (`tests/cli`) | 33 |
| **Total (automated regression)** | **421/421** |

Standalone unit-test executables (`3/3` passing):
- `bin/test-ast-list-ownership.exe` (`test-ast-ownership`)
- `bin/test-symbol-table.exe` (`test-symtab`)
- `bin/test-tac.exe` (`test-tac-unit`)

```powershell
# All suites (421 automated tests + 3 unit-test executables):
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test

# Unified CLI & language compiler suites:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-cli
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-c-compiler
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-cpp-compiler
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-java-compiler

# Build & launch Electron desktop IDE (development workspace mode):
npm --prefix frontend run build
npm --prefix frontend run electron:start
```

Bison builds fail on unresolved shift/reduce or reduce/reduce conflicts (`-Werror=conflicts-sr -Werror=conflicts-rr`).

---

## 9. Remaining Work

| Item | Focus | Status |
|---|---|---|
| **M13** | Frontend–compiler integration | Completed (Electron dev IDE) |
| **Desktop Packaging** | Standalone installer / portable app bundle | Pending |
| **M14** | Final documentation and faculty verification | Pending |
| **DEC-07** | Short-circuit vs eager logical evaluation (`&&` / `||`) | Open (interim eager TAC policy) |
| **Language subsets** | Constructs outside bounded C/C++/Java subsets | Documented in `docs/{c,cpp,java}_frontend.md` |

C, C++, and Java front ends implement documented subsets (not full language specifications) and share the AST / symbol table / semantic / TAC core.
