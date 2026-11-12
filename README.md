# CompileCraft

> **A Multi-Language Compiler Front-End for C, C++, and Java Subsets**
> **Current focus**: lexical analysis. Later milestones add parsing, AST, semantics, and TAC.

---

## 1. Project Overview

**CompileCraft** is a modular compiler front-end developed in **C**, **Flex**, and **Bison**. It targets distinct subsets of **C**, **C++**, and **Java** through separate language front ends that will eventually share AST, symbol-table, and Three-Address Code (TAC) infrastructure.

**Implemented today (Milestone 2.4):** four standalone Flex lexers (baseline mini-language, C, C++, and Java), Makefile integration, and automated regression tests with optional semantic-value verification.

**Planned (not yet implemented):** Bison parsers, AST construction, scoped symbol tables, semantic analysis, TAC generation, and a unified CLI driver.

---

## 2. Target Compiler Pipeline Architecture

The diagram below is the **target** architecture. Only the lexer stage of each front end is implemented so far.

```
  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
  │   C Source (.c)  │    │ C++ Source (.cpp)  │    │  Java Source (.java)│
  └────────┬─────────┘    └─────────┬──────────┘    └──────────┬──────────┘
           │                        │                          │
           ▼                        ▼                          ▼
  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
  │  C Front-End     │    │   C++ Front-End    │    │   Java Front-End    │
  │  - Lexer (DONE)  │    │   - Lexer (DONE)   │    │   - Lexer (DONE)    │
  │  - Parser (PLAN) │    │   - Parser (PLAN)  │    │   - Parser (PLAN)   │
  │  - AST (PLAN)    │    │   - AST (PLAN)     │    │   - AST (PLAN)      │
  └────────┬─────────┘    └─────────┬──────────┘    └──────────┬──────────┘
           │                        │                          │
           └───────────────────┐    │    ┌─────────────────────┘
                               ▼    ▼    ▼
                    ┌──────────────────────────────┐
                    │ Shared Core AST & Symbol     │
                    │ Table (PLANNED)              │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │ Semantic Analyzer (PLANNED)  │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │ TAC Generator (PLANNED)      │
                    └──────────────────────────────┘
```

### Out-of-Scope Architecture Boundaries
By design, backend machine code generation, hardware assembly, native linking, hardware register allocation, and executable binary generation are explicitly out of scope. The eventual compiler pipeline intentionally terminates at intermediate Three-Address Code (TAC).

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

> **Status**: **Milestone 2.4 — Lexer Integration and Final Verification**
> *Four Flex lexers integrated (baseline, C, C++, Java). Preprocessor line-start policy, escape-subset validation, semantic-value dump mode, and expanded regression coverage. Parsers/AST/semantics/TAC remain planned.*

### Status Matrix

| Module / Component | Description | Status | Current Details |
|---|---|:---:|---|
| **Environment & Toolchain** | MSYS2 GCC, Flex, Bison, Make, and Python verification | **COMPLETED** | Verified 64-bit UCRT64 GCC 16.2.0, Flex 2.6.4, Bison 3.8.2; Python checked via `toolchain-check`. |
| **Build Foundation** | Modular `Makefile` with tool overrides & multi-targets | **COMPLETED** | Supports `toolchain-check`, `lexer`, `lexer-c`, `lexer-cpp`, `lexer-java`, `test-lexer`, `test-c`, `test-cpp`, `test-java`, `test`, `clean`. |
| **Requirements Specification** | Multi-language technical requirements checklist | **COMPLETED** | See `docs/requirements.md`. |
| **Engineering Decisions** | Language subset definitions, analysis, decisions | **COMPLETED** | See `docs/decisions.md` (DEC-13 Multi-Language Architecture). |
| **Milestone Roadmap** | Multi-language roadmap with verification criteria | **COMPLETED** | See `docs/roadmap.md`. |
| **Core Lexer Baseline (`src/lexer/`)** | Baseline scanner specification, driver, tests | **COMPLETED** | Baseline suite via `tests/run_tests.py`. |
| **C Lexical Analyzer (`C_Compiler/`)** | ISO C99/C11 subset lexer, driver, tests | **COMPLETED** | Includes line-start preprocessor rejection and escape validation. |
| **C++ Lexical Analyzer (`CPP_Compiler/`)** | ISO C++98/C++11 OOP subset lexer, driver, tests | **COMPLETED** | Includes line-start preprocessor rejection and escape validation. |
| **Java Lexical Analyzer (`Java_Compiler/`)** | Java SE class-enclosed subset lexer, driver, tests | **COMPLETED** | Includes escape-subset validation (`\0` retained as subset extension). |
| **Visual Interface Front-End (`frontend/`)** | Visual user interface component | **PLANNED** | Planned visual-interface component. |
| **Visual Interface Back-End (`backend/`)** | Visual interface API / service component | **PLANNED** | Planned visual-interface component. |
| **Shared Core AST (`src/common/ast/`)** | Common AST node structures & visualizer | **PLANNED** | Scheduled for Milestone 4. |
| **Shared Symbol Table (`src/common/symbol_table/`)** | Multi-scope symbol table manager | **PLANNED** | Scheduled for Milestone 5. |
| **Semantic Analyzer (`src/semantic/`)** | Scope, type, and OOP constraint checks | **PLANNED** | Scheduled for Milestone 6. |
| **Shared TAC Generator (`src/common/tac/`)** | Three-Address Code intermediate representation | **PLANNED** | Scheduled for Milestone 7. |
| **CLI Driver (`src/main.c`)** | Universal multi-language CLI (`compilecraft`) | **PLANNED** | Scheduled for Milestone 8. |
| **Regression Test Suite (`tests/`)** | Multi-language lexer test suites | **COMPLETED (Lexer M2.4)** | 87 automated tests (baseline 18, C 25, C++ 24, Java 20), including preprocessor, escape, and semantic-value cases. |

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
│   ├── tokens.md                # Authoritative baseline token specifications
│   ├── tokens_c.md              # Authoritative C subset token specifications
│   ├── tokens_cpp.md            # Authoritative C++ subset token specifications
│   └── tokens_java.md           # Authoritative Java subset token specifications
├── C_Compiler/                  # [Milestone 2.1 Complete] C-subset compiler front end
│   ├── tokens.def               # C subset token definitions
│   ├── tokens.h / tokens.c      # C token enum and resolver
│   ├── lexer.l                  # C Flex scanner (ISO C99/C11 procedural subset)
│   └── main_c.c                 # Standalone C lexer CLI driver
├── CPP_Compiler/                # [Milestone 2.2 Complete] C++ subset compiler front end
│   ├── tokens.def               # C++ subset token definitions
│   ├── tokens.h / tokens.c      # C++ token enum and resolver
│   ├── lexer.l                  # C++ Flex scanner (ISO C++98/C++11 OOP subset)
│   └── main_cpp.c               # Standalone C++ lexer CLI driver
├── Java_Compiler/               # [Milestone 2.3 Complete] Java subset compiler front end
│   ├── tokens.def               # Java subset token definitions
│   ├── tokens.h / tokens.c      # Java token enum and resolver
│   ├── lexer.l                  # Java Flex scanner (class-enclosed OOP subset)
│   └── main_java.c              # Standalone Java lexer CLI driver
├── frontend/                    # [Planned] Visual interface front end (UI component)
├── backend/                     # [Planned] Visual interface back end (API / service component)
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
│   └── main.c                   # [Planned M8] Universal compiler CLI driver
└── tests/
    ├── run_tests.py             # Multi-suite regression test runner (.mc, .c, .cpp, .java)
    ├── lexer/                   # Baseline 17 test cases (.mc / .expected)
    ├── c/                       # C-subset 19 test cases (.c / .expected)
    ├── cpp/                     # C++-subset 18 test cases (.cpp / .expected)
    └── java/                    # Java-subset 16 test cases (.java / .expected)
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
# Build baseline, C-subset, C++-subset, and Java-subset lexers:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" all

# Or build individual targets:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer-c
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer-cpp
& "E:\msys64\ucrt64\bin\mingw32-make.exe" lexer-java
```

### 6.3 Running Regression Tests
To execute the automated regression test suites:

```powershell
# Run all test suites (baseline + C + C++ + Java):
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test

# Or run individual test suites:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-lexer
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-c
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-cpp
& "E:\msys64\ucrt64\bin\mingw32-make.exe" test-java
```
