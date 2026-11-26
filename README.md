# CompileCraft

> **A Multi-Language Compiler Front-End & Shared TAC Virtual Machine for C, C++, and Java Subsets**
> **Current focus**: baseline `.mc` (**M0–M7**), **M9–M12 C/C++/Java Front-Ends & Hardening**, **M8 Unified CLI (`compilecraft.exe`)**, **M13 Electron Desktop IDE (`frontend/`)**, and **M15 Shared TAC Virtual Machine (`src/vm/` + `--run` + IDE Program Output & Stop)**. Remaining: **M14** desktop packaging & final faculty verification.

---

## 1. Project Overview

**CompileCraft** is a modular compiler front-end and bytecode/IR execution environment developed in **C**, **Flex**, **Bison**, and **Electron/React/Monaco**. It targets:

- A **baseline mini-language** (`.mc`) through `Lexer → Parser → AST → Symbol Table → Semantic Analysis → TAC`.
- Bounded procedural/entry-wrapper subsets of **C** (`C_Compiler/`), **C++** (`CPP_Compiler/`), and **Java** (`Java_Compiler/`), compiled through dedicated Flex lexers and Bison parsers into a shared AST, symbol table, semantic analyzer, TAC generator, and **Shared TAC Virtual Machine (`src/vm/`)** (`Source → Flex → Bison → AST → Semantic Analysis → TAC → Shared TAC VM → Program Output`). *(These front ends support documented language subsets, not full ISO C, C++, or Java specifications.)*

Native target machine codegen (x86/ARM assembly/linking) is **not** performed; instead, verified Three-Address Code (TAC) executes directly inside CompileCraft's own built-in TAC Virtual Machine (`docs/vm.md`) without calling external compilers (`gcc`, `g++`, `javac`).

**Implemented today (through Milestone 15):**

- **Shared TAC Virtual Machine (`src/vm/` → `--run`)**: Executes C, C++, and Java TAC programs with tagged `int`/`float`/`bool`/`string` values, arithmetic/unary/relational/eager-logical operators (DEC-07), label jump indexing, nested loops, C `printf` (`%d`, `%f`, `%s`, `%%`, escapes `\n`, `\t`, `\r`, `\\`, `\"`, `\0`), C++ `std::cout`/`std::endl`, Java `System.out.print`/`println` concatenation, AST-to-TAC line-numbered runtime errors (div/mod by zero, uninitialized read, type/printf faults), partial stdout flushing, and bounded `1,000,000`-step infinite-loop protection. *(Interactive stdin input such as `scanf`/`cin`/`Scanner` is not yet supported; see `docs/vm.md` Section 6.)*
- **Unified CLI (`src/main.c` → `bin/compilecraft.exe`)**: Extension-based dispatch for C (`.c`), C++ (`.cpp`), and Java (`.java`), `--help` / `--tokens` / `--ast` / `--symtab` / `--run` flags, safe native process invocation (no shell), and reliable path resolution from outside the repo or paths with spaces. *(Baseline `.mc` remains supported through its dedicated drivers `compilecraft-{lexer,parser,semantic,tac}.exe`.)*
- **Electron + React Desktop IDE (`frontend/`)**: Monaco-based IDE connected via a hardened Electron IPC host (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `child_process.spawn` without shell) to `bin/compilecraft.exe` for C, C++, and Java, displaying real **Tokens**, **AST**, **Symbol Table**, **TAC**, live **Program Output** (stdout, runtime errors, status & timing), clickable line-numbered **Errors**, and **Stop** execution cancellation.
- Four standalone Flex lexers (baseline `.mc`, C, C++, Java).
- Hardened baseline `.mc` Bison parser (`src/parser/`), AST core (`src/ast/`), scoped symbol table (`src/symbol_table/`), six-rule semantic analyzer (`src/semantic/`), and TAC generator (`src/tac/`).
- **C front-end** (`C_Compiler/`): `Flex → Bison → Shared AST → Semantic Analysis → TAC` (`bin/compilecraft-c.exe`), supporting `#include <stdio.h>`, `int`, `float`, `_Bool`/`bool`, `true`/`false`, `if`/`else if`/`else`, `while`, `for`, `++`/`--`, `printf(...)` console output, and all six faculty semantic rules.
- **C++ front-end** (`CPP_Compiler/`): `Flex → Bison → Shared AST → Semantic Analysis → TAC` (`bin/compilecraft-cpp.exe`), supporting `#include <iostream>`, `int`, `float`, `bool`, `true`/`false`, `if`/`else if`/`else`, `while`, `for`, `++`/`--`, `std::cout << ...` / `std::endl` console output, and all six faculty semantic rules.
- **Java front-end** (`Java_Compiler/`): `Flex → Bison → Shared AST → Semantic Analysis → TAC` (`bin/compilecraft-java.exe`), supporting `[public] class <Name> { public static void main(String[] args) { ... } }`, `int`, `float`, `boolean`, `true`/`false`, `if`/`else if`/`else`, `while`, `for`, `++`/`--`, `System.out.print` / `System.out.println`, and all six faculty semantic rules.
- Production parser and language compiler CLIs with optional `--ast` and `--symtab` output.

**Remaining / Not yet implemented:** Desktop installer packaging (Electron bundler configuration), final documentation & faculty verification (**M14**), interactive stdin input (`scanf` / `std::cin` / `Scanner`, proposed in `docs/vm.md`), final **DEC-07** short-circuit policy for `&&` / `||`, and unsupported constructs documented per language.

---

## 2. Compiler & Execution Pipeline

### Baseline mini-language (`.mc`)

```
Lexer → Parser → AST → Symbol Table → Semantic Analysis → TAC
 DONE    DONE    DONE       DONE             DONE          DONE
```

### Multi-language pipelines (bounded subsets)

```
- Baseline .mc : Lexer → Parser → AST → Symbol Table → Semantic Analysis → TAC
- C            : Flex → Bison → Shared AST → Semantic Analysis → TAC → Shared TAC VM (--run)
- C++          : Flex → Bison → Shared AST → Semantic Analysis → TAC → Shared TAC VM (--run)
- Java         : Flex → Bison → Shared AST → Semantic Analysis → TAC → Shared TAC VM (--run)
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
                    │ TAC / Shared TAC VM) — DONE       │
                    └───────────────────────────────────┘
```

**Baseline AST today** lives under `src/ast/`. TAC docs: `docs/tac.md`. Shared TAC VM docs: `docs/vm.md`.

### Out-of-scope boundaries

Native machine code generation (x86/ARM assembly, register allocation, linking) and standalone native executable emission are out of scope; compiled programs execute cleanly via the built-in Shared TAC VM (`--run`).

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

> **Status**: **Milestone 15 — Shared TAC Virtual Machine & Execution (complete on `dev`)**
> *C, C++, and Java subsets compile through Flex → Bison → AST → Semantic → TAC and execute inside CompileCraft's Shared TAC VM via CLI `--run` and the Electron IDE.*

### Status matrix

| Module / Component | Description | Status | Notes |
|---|---|:---:|---|
| **Environment & Toolchain** | MSYS2 GCC, Flex, Bison, Make, Python | **COMPLETED** | Verified via `toolchain-check`. |
| **Build Foundation** | Modular `Makefile` | **COMPLETED** | All lexers, parsers, AST/symtab/semantic/TAC/VM targets, C/C++/Java front ends; Bison `-Werror=conflicts-*`. |
| **Requirements / Decisions / Roadmap** | Spec docs | **COMPLETED** | See `docs/` (synced through M15). |
| **Baseline Lexer (`src/lexer/`)** | Flex scanner + driver | **COMPLETED** | 18 tests. |
| **C / C++ / Java Lexers** | Subset scanners | **COMPLETED** | 28 + 25 + 20 tests. C/C++/Java parsers & console I/O done (M9/M10/M11/M12/M13+). |
| **Baseline Parser (`src/parser/`)** | Bison LALR(1) + recovery | **COMPLETED (M3.2–M3.3)** | 34 syntax tests. See `docs/parser.md`. |
| **AST Core (`src/ast/`)** | Nodes, constructors, lists, `ast_free`, `ast_print` | **COMPLETED (M4.0–M4.1)** | Design: `docs/ast.md`. |
| **AST ↔ Parser Integration** | Locations, `%union`, destructors, construction | **COMPLETED (M4.2–M4.2.7)** | Expr / program suites + ownership unit test. |
| **AST Root + `--ast` CLI** | Production handoff and dump | **COMPLETED (M4.3.1–M4.3.2)** | See CLI section below. |
| **Production `tests/ast/` goldens** | Parser `--ast` golden suite | **COMPLETED (M4.4)** | 14 cases; `mingw32-make test-ast`. |
| **Symbol Table (`src/symbol_table/`)** | Scoped symbols & hierarchy | **COMPLETED (M5)** | Scoped frames, shadowing, isolation, unit-test executable. |
| **Semantic Analysis (`src/semantic/`)** | Type & semantic rule checks | **COMPLETED (M6)** | 6 faculty rules, 26 regression tests (`bin/compilecraft-semantic.exe`). |
| **TAC (`src/tac/`)** | Three-Address Code generation | **COMPLETED (M7/M15)** | Semantic-gated driver, AST source-line metadata, unit-test executable + 16 golden cases; DEC-07 interim eager `&&`/`\|\|`. |
| **Shared TAC VM (`src/vm/`)** | Multi-language TAC execution engine | **COMPLETED (M15)** | Executes verified TAC across C, C++, and Java (`--run`, scope isolation, `int->float`, `DBL_DECIMAL_DIG`/`%.Nf`, `printf`/`cout`/`System.out`, runtime traps, 1M step cap); unit + 35 execution tests. |
| **C front-end (`C_Compiler/`)** | C subset parse → TAC → VM | **COMPLETED (M9/M12/M15)** | `compilecraft-c.exe`; `_Bool`/`bool`; for-loops; `printf`; `--run`; all 6 faculty rules + TAC under `tests/c/{parser,semantic,tac}/`. |
| **C++ front-end (`CPP_Compiler/`)** | C++ subset parse → TAC → VM | **COMPLETED (M10/M12/M15)** | `compilecraft-cpp.exe`; `bool`; for-loops; `std::cout`; `--run`; all 6 faculty rules + TAC under `tests/cpp/{parser,semantic,tac}/`. |
| **Java front-end (`Java_Compiler/`)** | Java subset parse → TAC → VM | **COMPLETED (M11/M12/M15)** | `compilecraft-java.exe`; `class`/`main` wrapper; `boolean`; for-loops; `System.out`; `--run`; all 6 faculty rules + TAC under `tests/java/{parser,semantic,tac}/`. |
| **Unified CLI (`src/main.c`)** | Extension-dispatching CLI driver | **COMPLETED (M8/M13/M15)** | `bin/compilecraft.exe` dispatching `.c`, `.cpp`, `.java` with `--tokens`, `--ast`, `--symtab`, `--run` (`tests/cli/`: 56 cases). |
| **Frontend–Compiler & VM IDE** | Electron + React + Monaco IDE | **COMPLETED (M13/M15)** | `frontend/electron/main.cjs` + `preload.cjs` invoking `bin/compilecraft.exe` with live **Program Output**, **TAC**, **Diagnostics**, and **Stop** cancellation. |
| **Final Docs & Packaging** | Installer bundling & final sign-off | **PENDING (M14)** | Electron packaging and final faculty review. |

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
.\bin\compilecraft.exe --run Main.java
.\bin\compilecraft.exe --help
```

- Supports **C (`.c`)**, **C++ (`.cpp`)**, and **Java (`.java`)** only; automatically selects the matching compiler pipeline by extension, passes `--ast`, `--symtab`, or `--run` when requested, invokes the resolved sibling binary via OS process APIs (no shell), emits TAC (or executes the TAC VM under `--run`) on success (`exit 0`), and suppresses TAC and execution on any lexical, syntax, semantic, or CLI error (`exit 1`). Baseline `.mc` remains served by `bin/compilecraft-{lexer,parser,semantic,tac}.exe`.

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

Reflects the repository as of Milestone 15 (planned installer packaging / unbuilt targets are omitted).

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
│   ├── vm.md                    # Shared TAC Virtual Machine & Program Output (M15)
│   ├── tokens.md
│   ├── tokens_c.md
│   ├── tokens_cpp.md
│   └── tokens_java.md
├── C_Compiler/                  # C-subset lexer + Bison parser + driver (M2.1/M9/M12/M15)
├── CPP_Compiler/                # C++-subset lexer + Bison parser + driver (M2.2/M10/M15)
├── Java_Compiler/               # Java-subset lexer + Bison parser + driver (M2.3/M11/M15)
├── frontend/                    # [M13/M15] Electron + React + Vite + Monaco IDE
│   ├── electron/
│   │   ├── main.cjs             # Hardened IPC process host (shell: false, Run & Stop)
│   │   └── preload.cjs          # Restricted contextBridge API
│   └── src/
│       ├── app/                 # Top-level IDE state & compiler orchestration
│       ├── components/          # TopBar, Sidebar, Workspace, StatusBar, dialogs
│       ├── data/                # C, C++, and Java IDE demonstration sources
│       ├── features/            # Monaco editor, Tokens, AST, Symbol Table, TAC, Program Output, Errors
│       ├── services/            # Typed IPC compiler service wrapper
│       └── types/               # Shared IDE & compile/execution result interfaces
├── src/
│   ├── main.c                   # [M8/M13/M15] Unified multi-language CLI dispatcher
│   ├── ast/                     # [M4] Shared AST core
│   ├── lexer/                   # Baseline .mc lexer
│   ├── parser/                  # Baseline .mc parser + AST wiring + CLI
│   ├── symbol_table/            # [M5] Shared scoped symbol table
│   ├── semantic/                # [M6] Shared semantic analyzer
│   ├── tac/                     # [M7/M15] Shared Three-Address Code generator
│   └── vm/                      # [M15] Shared TAC Virtual Machine (vm, vm_value)
└── tests/
    ├── run_tests.py
    ├── cli/                     # 56 unified CLI integration & error tests (M8/M13/M15)
    ├── lexer/                   # 18
    ├── c/                       # 28 lexer + parser/ (25) + semantic/ (17) + tac/ (13)
    ├── cpp/                     # 25 lexer + parser/ (34) + semantic/ (11) + tac/ (17)
    ├── java/                    # 20 lexer + parser/ (36) + semantic/ (13) + tac/ (17)
    ├── parser/                  # 34
    ├── expr_ast/                # 30 (structural; harness binary)
    ├── program_ast/             # 25 (structural; harness binary)
    ├── ast/                     # 14 (production --ast goldens)
    ├── ast_ownership/           # AST list-ownership unit-test executable
    ├── symbol_table/            # Symbol table unit-test executable
    ├── semantic/                # 26
    ├── tac/                     # TAC unit-test executable + golden/ (16)
    └── vm/                      # [M15] VM unit-test executable + 35 execution tests
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

Builds also produce `bin/compilecraft.exe`, `bin/compilecraft-semantic.exe`, `bin/compilecraft-tac.exe`, AST harnesses, and four standalone C unit-test executables (`bin/test-ast-list-ownership.exe`, `bin/test-symbol-table.exe`, `bin/test-tac.exe`, `bin/test-vm.exe`).

### 8.3 Regression tests

| Suite | Passed |
|---|---:|
| Automated regression (21 suites; includes 471 baseline/console I/O cases) | 510/510 |
| Unit-test executables | 4/4 |

Breakdown of the **510/510** automated regression cases:

| Suite | Cases |
|---|---:|
| Baseline lexer (`tests/lexer`) | 18 |
| C lexer (`tests/c`) | 28 |
| C++ lexer (`tests/cpp`) | 25 |
| Java lexer (`tests/java`) | 20 |
| Baseline parser (`tests/parser`) | 34 |
| Expression AST (`tests/expr_ast`) | 30 |
| Program AST (`tests/program_ast`) | 25 |
| Production AST (`tests/ast`) | 14 |
| Semantic analyzer (`tests/semantic`) | 26 |
| TAC golden (`tests/tac/golden`) | 16 |
| C parser / semantic / TAC (`tests/c/{parser,semantic,tac}`) | 25 + 17 + 13 |
| C++ parser / semantic / TAC (`tests/cpp/{parser,semantic,tac}`) | 34 + 11 + 17 |
| Java parser / semantic / TAC (`tests/java/{parser,semantic,tac}`) | 36 + 13 + 17 |
| Unified CLI (`tests/cli`, incl. `--run`) | 56 |
| Shared TAC VM execution (`tests/vm/test_vm_execution.py`) | 35 |
| **Total (automated regression)** | **510/510** |

Standalone unit-test executables (`4/4` passing):
- `bin/test-ast-list-ownership.exe` (`test-ast-ownership`)
- `bin/test-symbol-table.exe` (`test-symtab`)
- `bin/test-tac.exe` (`test-tac-unit`)
- `bin/test-vm.exe` (`test-vm-unit`)

```powershell
# All suites (510 automated tests + 4 unit-test executables):
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test

# Unified CLI, Shared TAC VM & language compiler suites:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-vm
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
| **M15** | Shared TAC VM, CLI `--run`, IDE Program Output & Stop | Completed |
| **Desktop Packaging** | Standalone installer / portable app bundle | Pending |
| **M14** | Final documentation and faculty verification | Pending |
| **Program Input (`TAC_OP_READ`)** | `scanf`, `std::cin`, Java `Scanner` runtime input | Proposed (see `docs/vm.md`) |
| **DEC-07** | Short-circuit vs eager logical evaluation (`&&` / `||`) | Open (interim eager TAC policy) |
| **Language subsets** | Constructs outside bounded C/C++/Java subsets | Documented in `docs/{c,cpp,java}_frontend.md` |

C, C++, and Java front ends implement documented subsets (not full language specifications) and share the AST / symbol table / semantic / TAC core.
