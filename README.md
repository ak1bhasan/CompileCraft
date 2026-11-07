# CompileCraft

> **A Mini Programming Language Compiler Front-End with Three-Address Code (TAC) Intermediate Code Generation**

---

## 1. Project Overview

**CompileCraft** is a modular compiler front-end developed in **C**, **Flex**, and **Bison**. The project processes source code written in a statically typed, block-scoped mini programming language, performs lexical, syntactic, and semantic validation, and produces linear **Three-Address Code (TAC)**.

The primary architectural goal of CompileCraft is to showcase a clean, decoupled compiler front-end pipeline where each phase communicates through explicit intermediate structures (token streams, Abstract Syntax Trees, scoped symbol tables, and TAC instructions) and emits human-readable diagnostic messages with line numbers.

---

## 2. Compiler Pipeline Phases

CompileCraft implements six front-end compilation phases:

```
Source Program (.mc / .txt)
           │
           ▼
┌─────────────────────────┐
│ 1. Lexical Analyzer     │  Tokenizes characters into keywords, identifiers, literals,
│    (Flex)               │  and operators; strips comments & whitespace; reports lexical errors.
└──────────┬──────────────┘
           │ Token Stream
           ▼
┌─────────────────────────┐
│ 2. Syntax Analyzer      │  Validates token sequence against formal Context-Free Grammar;
│    (Bison)              │  implements syntax error recovery via Bison 'error' token.
└──────────┬──────────────┘
           │ Parse Tree / Production Actions
           ▼
┌─────────────────────────┐
│ 3. Abstract Syntax Tree │  Constructs a clean hierarchical tree node representation devoid
│    (AST Construction)   │  of syntax boilerplate; supports formatted indented tree printing.
└──────────┬──────────────┘
           │ Raw AST
           ▼
┌─────────────────────────┐
│ 4. Symbol Table Manager │  Tracks identifiers, types (int, float, bool), declaration lines,
│    & Lexical Scoping    │  and manages enter/exit scopes for block isolation.
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 5. Semantic Analyzer    │  Enforces 6 mandatory semantic constraints (undeclared use,
│    (Type & Scope Check) │  redeclaration, scope violations, type mismatches, invalid assign).
└──────────┬──────────────┘
           │ Annotated / Validated AST
           ▼
┌─────────────────────────┐
│ 6. Intermediate Code    │  Emits linear Three-Address Code (TAC) with temporaries (t0, t1...)
│    Generator (TAC)      │  and control flow jump labels (L0, L1...).
└──────────┬──────────────┘
           │
           ▼
  Three-Address Code (TAC) Output
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

> **Status**: **Stage 1 Complete — Build Foundation, Toolchain Verification, and Specification Planning**  
> *Compiler source modules are scheduled for incremental implementation starting in Milestone 1.*

### Status Matrix

| Module / Component | Description | Status | Current Details |
|---|---|:---:|---|
| **Environment & Toolchain** | MSYS2 GCC, Flex, Bison, and Make verification | **COMPLETED** | Verified via standalone smoke test generating and executing C lexer/parser. |
| **Build Foundation** | Modular `Makefile` with tool overrides & sanity targets | **COMPLETED** | Supports `mingw32-make toolchain-check`, `help`, and `clean`. |
| **Requirements Specification** | Traceable technical requirements checklist | **COMPLETED** | See `docs/requirements.md`. |
| **Engineering Decisions** | Specification analysis, conclusions, and open items | **COMPLETED** | See `docs/decisions.md`. |
| **Milestone Roadmap** | Granular roadmap with verification criteria | **COMPLETED** | See `docs/roadmap.md`. |
| **Lexical Analyzer (`src/lexer/`)** | Flex scanner specification (`lexer.l`) | **PLANNED** | Scheduled for Milestone 2. |
| **Syntax Analyzer (`src/parser/`)** | Bison grammar specification (`parser.y`) | **PLANNED** | Scheduled for Milestone 3. |
| **AST (`src/ast/`)** | Node structures, constructors, and visualizer | **PLANNED** | Scheduled for Milestone 4. |
| **Symbol Table (`src/symbol_table/`)** | Scoped symbol table and scope lifecycle | **PLANNED** | Scheduled for Milestone 5. |
| **Semantic Analyzer (`src/semantic/`)** | 6 mandatory semantic checks & diagnostics | **PLANNED** | Scheduled for Milestone 6. |
| **TAC Generator (`src/tac/`)** | Three-Address Code intermediate representation | **PLANNED** | Scheduled for Milestone 7. |
| **CLI Driver (`src/main.c`)** | Main compiler driver executable (`compilecraft`) | **PLANNED** | Scheduled for Milestone 8. |
| **Test Suite (`tests/`)** | Valid programs, lexical, syntax, and semantic tests | **PLANNED** | Scheduled for Milestone 9. |

---

## 5. Directory Structure

```
CompileCraft/
├── .gitignore               # Ignores build artifacts, generated files, local files
├── README.md                # Project architecture, verified stack, and setup instructions
├── Makefile                 # Verified build automation supporting tool overrides
├── docs/
│   ├── requirements.md      # Traceable technical requirements and specification rules
│   ├── roadmap.md           # Milestone plan with acceptance criteria and commit messages
│   └── decisions.md         # Open questions, manual-backed conclusions, and proposals
├── src/                     # [Planned] Source code organized by compiler phase
│   ├── lexer/               # Flex lexical specifications (.l)
│   ├── parser/              # Bison grammar specifications (.y)
│   ├── ast/                 # AST node data structures and printer
│   ├── symbol_table/        # Scoped symbol table implementation
│   ├── semantic/            # Type checker and semantic validation passes
│   ├── tac/                 # Three-Address Code data structures and generator
│   └── main.c               # Compiler CLI driver entry point
├── tests/                   # [Planned] Test programs paired with expected outputs
│   ├── valid/               # Valid test cases (.mc) and expected TAC (.expected)
│   ├── lexical_errors/      # Invalid character/token test cases
│   ├── syntax_errors/       # Grammar violation test cases
│   └── semantic_errors/     # Tests for each of the 6 mandatory semantic error types
└── examples/                # [Planned] Representative sample programs
```

---

## 6. Build and Verification Instructions

### 6.1 Toolchain Sanity Check
To verify that all required build tools resolve to functional 64-bit binaries:

```powershell
# Using the verified mingw32-make from PowerShell / CMD:
& "E:\msys64\ucrt64\bin\mingw32-make.exe" toolchain-check
```

### 6.2 Building with Custom Tool Paths
Tool paths can be overridden directly from the command line if tools are installed elsewhere:

```powershell
& "E:\msys64\ucrt64\bin\mingw32-make.exe" `
    CC="E:/msys64/ucrt64/bin/gcc.exe" `
    FLEX="E:/msys64/usr/bin/flex.exe" `
    BISON="E:/msys64/usr/bin/bison.exe" `
    toolchain-check
```

### 6.3 Planned Compiler Usage (Post-Implementation)
Once `src/main.c` and compiler modules are implemented in subsequent milestones:
```bash
# Build the compilecraft binary
mingw32-make all

# Run compiler on a source file to output TAC
./compilecraft examples/sample.mc

# Run the automated test suite
mingw32-make test
```
