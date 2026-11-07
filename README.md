# CompileCraft

> **A Multi-Language Compiler Front-End Supporting C, C++, and Java Subsets with Unified Three-Address Code (TAC) Intermediate Representation**

---

## 1. Project Overview

**CompileCraft** is a modular compiler front-end developed in **C**, **Flex**, and **Bison**. The project processes source code written in distinct subsets of **C**, **C++**, and **Java**, performs lexical, syntactic, and semantic validation across separate language front ends, and emits linear **Three-Address Code (TAC)** through a shared intermediate representation.

The primary architectural goal of CompileCraft is to showcase a decoupled, multi-frontend compiler pipeline where each language front end maps its idiosyncratic syntax (procedural C, object-oriented C++, and class-centric Java) into shared intermediate structures (Abstract Syntax Trees, scoped symbol tables, and TAC instructions) while emitting human-readable diagnostic messages with line numbers.

---

## 2. Compiler Pipeline Architecture

CompileCraft supports three language front ends feeding into a shared intermediate representation and TAC generator:

```
  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
  │   C Source (.c)  │    │ C++ Source (.cpp)  │    │  Java Source (.java)│
  └────────┬─────────┘    └─────────┬──────────┘    └──────────┬──────────┘
           │                        │                          │
           ▼                        ▼                          ▼
  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
  │  C Front-End     │    │   C++ Front-End    │    │   Java Front-End    │
  │  - Lexer (Flex)  │    │   - Lexer (Flex)   │    │   - Lexer (Flex)    │
  │  - Parser (Bison)│    │   - Parser (Bison) │    │   - Parser (Bison)  │
  │  - AST Mapper    │    │   - AST Mapper     │    │   - AST Mapper      │
  └────────┬─────────┘    └─────────┬──────────┘    └──────────┬──────────┘
           │                        │                          │
           └───────────────────┐    │    ┌─────────────────────┘
                               ▼    ▼    ▼
                    ┌──────────────────────────────┐
                    │      Shared Core AST &       │
                    │   Scoped Symbol Table Engine │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │      Semantic Analyzer       │
                    │   (Type & Scope Validation)  │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │ Intermediate Code Generator  │
                    │  Three-Address Code (TAC)    │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                        Three-Address Code (TAC)
```

### Out-of-Scope Architecture Boundaries
By design, backend machine code generation, hardware assembly, native linking, hardware register allocation, and executable binary generation are explicitly out of scope. The compiler pipeline intentionally terminates at intermediate Three-Address Code (TAC).

---

## 3. Technology Stack & Verified Toolchain

CompileCraft is configured to use the 64-bit MSYS2 toolchain located at `E:\msys64`:

| Component | Selected Tool | Verified Version | Resolved Path |
|---|---|---|---|
| **Programming Language** | C (C99 / C11) | ISO C Standard | Standard C Library |
| **C Compiler** | GCC (MSYS2 UCRT64) | 16.2.0 | `E:\msys64\ucrt64\bin\gcc.exe` |
| **Lexer Generator** | Flex | 2.6.4 | `E:\msys64\usr\bin\flex.exe` |
| **Parser Generator** | Bison | 3.8.2 | `E:\msys64\usr\bin\bison.exe` |
| **Build Automation** | GNU Make | 4.4.1 | `E:\msys64\ucrt64\bin\mingw32-make.exe` |
| **Version Control** | Git | 2.43.0 | `C:\Program Files\Git\cmd\git.exe` |
| **Documentation** | Markdown | CommonMark | Native |

> **Note**: Legacy 32-bit binaries in `E:\mingw32\msys\1.0\bin` fail on modern Windows due to memory relocation conflicts (`{Illegal System DLL Relocation}`). The project Makefile and build scripts explicitly target the verified 64-bit tools in `E:\msys64`.

---

## 4. Current Implementation Status

> **Status**: **Milestone 2.1 Complete — C-Subset Lexical Analyzer Verified**  
> *Baseline Flex lexical analyzer (`src/lexer/`) verified (17/17 tests). C-subset lexical analyzer (`src/frontend_c/`) verified (19/19 tests). Total 36 automated tests passing across both suites.*

### Status Matrix

| Module / Component | Description | Status | Current Details |
|---|---|:---:|---|
| **Environment & Toolchain** | MSYS2 GCC, Flex, Bison, and Make verification | **COMPLETED** | Verified 64-bit UCRT64 GCC 16.2.0, Flex 2.6.4, Bison 3.8.2. |
| **Build Foundation** | Modular `Makefile` with tool overrides & multi-targets | **COMPLETED** | Supports `toolchain-check`, `lexer`, `lexer-c`, `test-lexer`, `test-c`, `test`, `clean`. |
| **Requirements Specification** | Multi-language technical requirements checklist | **COMPLETED** | See `docs/requirements.md`. |
| **Engineering Decisions** | Language subset definitions, analysis, decisions | **COMPLETED** | See `docs/decisions.md` (DEC-13 Multi-Language Architecture). |
| **Milestone Roadmap** | Multi-language roadmap with verification criteria | **COMPLETED** | See `docs/roadmap.md`. |
| **Core Lexer Baseline (`src/lexer/`)** | Baseline scanner specification, driver, tests | **COMPLETED** | 17/17 automated tests passing via `tests/run_tests.py`. |
| **C Lexical Analyzer (`src/frontend_c/`)** | ISO C99/C11 subset lexer, driver, tests | **COMPLETED** | 19/19 automated tests passing via `tests/run_tests.py`. |
| **C++ Lexical Analyzer (`src/frontend_cpp/`)** | C++ subset lexer & driver | **PLANNED** | Scheduled for Milestone 2.2. |
| **Java Lexical Analyzer (`src/frontend_java/`)** | Java subset lexer & driver | **PLANNED** | Scheduled for Milestone 2.3. |
| **Shared Core AST (`src/common/ast/`)** | Common AST node structures & visualizer | **PLANNED** | Scheduled for Milestone 4. |
| **Shared Symbol Table (`src/common/symbol_table/`)** | Multi-scope symbol table manager | **PLANNED** | Scheduled for Milestone 5. |
| **Semantic Analyzer (`src/semantic/`)** | Scope, type, and OOP constraint checks | **PLANNED** | Scheduled for Milestone 6. |
| **Shared TAC Generator (`src/common/tac/`)** | Three-Address Code intermediate representation | **PLANNED** | Scheduled for Milestone 7. |
| **CLI Driver (`src/main.c`)** | Universal multi-language CLI (`compilecraft`) | **PLANNED** | Scheduled for Milestone 8. |
| **Regression Test Suite (`tests/`)** | Multi-language test suites | **IN PROGRESS** | Baseline (17 tests) and C (19 tests) operational (36 total passing). |

---

## 5. Directory Structure

```
CompileCraft/
├── .gitignore                   # Ignores build artifacts, generated files, local files
├── README.md                    # Multi-language architecture, toolchain, and usage
├── Makefile                     # Build automation with tool overrides and targets
├── docs/
│   ├── requirements.md          # Multi-language technical requirements
│   ├── roadmap.md               # Milestone plan with acceptance criteria
│   ├── decisions.md             # Subsets, decisions, and architectural proposals (DEC-13)
│   ├── grammar.md               # Context-Free Grammar specifications
│   └── tokens.md                # Authoritative token specifications (tokens.def strategy)
├── src/
│   ├── common/                  # [Planned] Shared compiler infrastructure
│   │   ├── ast/                 # Shared AST nodes, constructors, pretty-printer
│   │   ├── symbol_table/        # Scoped symbol table and scope lifecycle
│   │   └── tac/                 # Three-Address Code data structures & emitter
│   ├── lexer/                   # [Baseline Complete] Core lexical analyzer
│   │   ├── tokens.def           # Master token X-macro table
│   │   ├── tokens.h / tokens.c  # Token enum and name resolver
│   │   ├── lexer.l              # Flex lexical specification
│   │   └── main.c               # Standalone baseline lexer driver
│   ├── frontend_c/              # [Milestone 2.1 Complete] C-subset front end
│   │   ├── tokens.def           # C subset token definitions
│   │   ├── tokens.h / tokens.c  # C token enum and resolver
│   │   ├── lexer.l              # C Flex scanner (ISO C99/C11 procedural subset)
│   │   └── main_c.c             # Standalone C lexer CLI driver
│   ├── frontend_cpp/            # [Planned M2.2] C++ subset front end
│   ├── frontend_java/           # [Planned M2.3] Java subset front end
│   └── main.c                   # [Planned M8] Universal compiler CLI driver
└── tests/
    ├── run_tests.py             # Multi-suite regression test runner
    ├── lexer/                   # Baseline 17 test cases (.mc / .expected)
    ├── c/                       # C-subset 19 test cases (.c / .expected)
    ├── cpp/                     # [Planned M2.2] C++ test cases (.cpp / .expected)
    └── java/                    # [Planned M2.3] Java test cases (.java / .expected)
```

---

## 6. Build and Verification Instructions

### 6.1 Toolchain Sanity Check
To verify that all required build tools resolve to functional 64-bit binaries:

```powershell
# Using the verified mingw32-make from PowerShell / CMD:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" toolchain-check
```

### 6.2 Building the Lexers
To build the standalone lexer binaries:

```powershell
# Build both baseline and C-subset lexers:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" all

# Or build individual targets:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer-c
```

### 6.3 Running Regression Tests
To execute the automated regression test suites:

```powershell
# Run all test suites (baseline + C subset):
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test

# Or run individual test suites:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-lexer
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-c
```
