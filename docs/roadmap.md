# Incremental Development Roadmap

> **Project**: CompileCraft — Mini Programming Language Compiler Front-End  
> **Development Strategy**: Milestone-driven incremental delivery with continuous verification, explicit toolchain bindings, and comprehensive test coverage.

---

## Roadmap Overview

```
[DONE] M0: Scaffolding & Toolchain Verification
           │
           ▼
M1: Formal Grammar (CFG) ──► M2: Lexer (Flex) ──► M3: Parser (Bison)
                                                        │
                                                        ▼
M6: Semantic Analysis ◄── M5: Symbol Table ◄── M4: AST Construction
       │
       ▼
M7: TAC Generation ──► M8: Driver Integration ──► M9: Test Suite ──► M10: Documentation
```

---

## Milestone 0: Scaffolding, Toolchain Verification & Build Baseline

### Objective
Establish the project workspace layout, verify a functional 64-bit toolchain (GCC, Flex, Bison, GNU Make), configure `.gitignore`, and provide a configurable `Makefile`.

### Status: **COMPLETED**
- [x] Verified MSYS2 toolchain at `E:\msys64` (GCC 16.2.0, Flex 2.6.4, Bison 3.8.2, GNU Make 4.4.1).
- [x] Created and executed isolated toolchain smoke test (`smoke.l` + `smoke.y`) parsing and calculating expressions successfully.
- [x] Configured `.gitignore` for build products, generated parser/lexer files, and local artifacts.
- [x] Authored `Makefile` supporting tool overrides (`CC`, `FLEX`, `BISON`, `MAKE`) and safe targets (`toolchain-check`, `help`, `clean`).

### Suggested Commit Messages
- `chore: initialize repository directory structure and gitignore`
- `build: configure verified MSYS2 toolchain and foundation Makefile`

---

## Milestone 1: Formal Grammar (CFG) & Token Specification

### Objective
Formally specify the Context-Free Grammar (CFG) and token sets based strictly on Section 5 of the manual, eliminating ambiguity and designing operator precedence before writing generator files.

### Status: **COMPLETED**
- [x] Documented formal BNF/CFG production rules covering all declarations, assignments, expressions, control flow, print, and blocks (`docs/grammar.md`).
- [x] Documented token table listing terminals, regular expressions, and semantic value types (`docs/tokens.md`).
- [x] Defined complete operator precedence and associativity hierarchy (validated via Bison: zero unresolved conflicts after precedence resolution).
- [x] Verified grammar unambiguously derives all constructs in the Section 5.5 sample program.
- [x] Defined basic syntax error recovery strategy utilizing Bison `error` token.

### Suggested Commit Messages
- `docs(spec): document formal context-free grammar and token specifications`

---

## Milestone 2: Lexical Analysis & Multi-Language Front-End Architecture

### Objective
Implement production-grade lexical analyzers using Flex to convert source characters into token streams, skip comments and whitespace, and report lexical errors with line numbers across three target languages: C, C++, and Java.

### Current Status: Milestone 2.4 Lexer Integration Complete
- [x] **Baseline Lexer (`src/lexer/`)**: Implemented authoritative `tokens.def`, `tokens.h`, `tokens.c`, Flex specification `lexer.l`, and standalone driver `main.c`.
- [x] **C-Subset Lexer (`C_Compiler/`)**: Implemented authoritative `tokens.def`, `tokens.h`, `tokens.c`, Flex specification `lexer.l`, and standalone driver `main_c.c`.
- [x] **C++-Subset Lexer (`CPP_Compiler/`)**: Implemented authoritative `tokens.def`, `tokens.h`, `tokens.c`, Flex specification `lexer.l`, and standalone driver `main_cpp.c`.
- [x] **Java-Subset Lexer (`Java_Compiler/`)**: Implemented authoritative `tokens.def`, `tokens.h`, `tokens.c`, Flex specification `lexer.l`, and standalone driver `main_java.c`.
- [x] **Automated Regression Baseline**: Original 70 tests retained; Milestone 2.4 expands coverage to 87 total tests (baseline 18, C 25, C++ 24, Java 20).
- [x] **Milestone 2.4 hardening**: line-start preprocessor policy, escape-subset validation, semantic-value verification, documentation accuracy, and expanded regression coverage.
- [ ] **Next Phase**: Milestone 3 Syntax Analyzer & Error Recovery (Bison).

### Revised Milestone 2 Execution Sequence

#### Milestone 2.0: Architectural Realignment & Language Subset Definitions [COMPLETED]
- [x] Defined realistic, bounded subsets for C, C++, and Java (DEC-13).
- [x] Documented formal token specification and preprocessor policy for C subset (`docs/tokens_c.md`).
- [x] Documented formal token specification and preprocessor policy for C++ subset (`docs/tokens_cpp.md`).
- [x] Document token tables for Java (`docs/tokens_java.md`).
- [ ] Structure shared compiler infrastructure directories (`src/common/ast/`, `src/common/symbol_table/`, `src/common/tac/` [Planned]).

#### Milestone 2.1: C Lexical Analyzer (`CompileCraft-C` / `C_Compiler/`) [COMPLETED]
- [x] Implement `C_Compiler/tokens.def`, `tokens.h`, `tokens.c`.
- [x] Implement `C_Compiler/lexer.l` supporting C subset keywords (`int`, `float`, `double`, `char`, `void`, `if`, `else`, `while`, `for`, `return`, `break`, `continue`), character/string literals with escape sequences, operators, and preprocessor rejection. (Note: `printf` and `main` are standard identifiers).
- [x] Build standalone C lexer driver `bin/compilecraft-lexer-c.exe`.
- [x] Add automated C lexical test suite (`tests/c/`) with 19/19 passing tests covering keywords, identifiers, operators, minus tokens, literals, escapes, CRLF, and error rejections.

#### Milestone 2.2: C++ Lexical Analyzer (`CompileCraft-CPP` / `CPP_Compiler/`) [COMPLETED]
- [x] Implement `CPP_Compiler/tokens.def`, `tokens.h`, `tokens.c`.
- [x] Implement `CPP_Compiler/lexer.l` adding 22 C++ subset keywords (`int`, `float`, `double`, `char`, `void`, `bool`, `true`, `false`, `if`, `else`, `while`, `for`, `return`, `break`, `continue`, `class`, `public`, `private`, `protected`, `new`, `delete`, `this`), OOP operators (`::`, `.`, `->`, `<<`, `>>`, arithmetic, relational, logical, compound assignment, inc/dec), and preprocessor rejection. (Note: `cout`, `cin`, `std`, `endl`, and `main` are standard identifiers).
- [x] Build standalone C++ lexer driver `bin/compilecraft-lexer-cpp.exe`.
- [x] Add automated C++ lexical test suite (`tests/cpp/`) with 18/18 passing tests covering all token categories, keyword boundaries, scope resolution, stream I/O, classes, CRLF endings, empty input, and error conditions.

#### Milestone 2.3: Java Lexical Analyzer (`CompileCraft-Java` / `Java_Compiler/`) [COMPLETED]
- [x] Implement `Java_Compiler/tokens.def`, `tokens.h`, `tokens.c`.
- [x] Implement `Java_Compiler/lexer.l` adding Java subset tokens (`class`, `public`, `static`, `void`, `boolean`, `new`, `this`, etc.). (Note: `System`, `out`, `println`, and `String` are standard identifiers).
- [x] Build standalone Java lexer driver `bin/compilecraft-lexer-java.exe`.
- [x] Add automated Java lexical test suite (`tests/java/`) with 16/16 passing tests covering keywords, identifiers, operators, literals, delimiters, comments/whitespace, CRLF, sample programs, and error conditions.

#### Milestone 2.4: Lexer Integration and Final Verification [COMPLETED]
- [x] Update `Makefile` with targets: `lexer-c`, `lexer-cpp`, `lexer-java`, `test-c`, `test-cpp`, `test-java`, `test`.
- [x] Integrate multi-language dispatching into `tests/run_tests.py` supporting `.mc`, `.c`, `.cpp`, and `.java`.
- [x] Add `lexer-java` and `test-java` targets upon completion of Milestone 2.3.
- [x] Align documentation so implemented vs planned stages are unambiguous.
- [x] Enforce line-start-only preprocessor rejection for C/C++; mid-line `#` is an invalid character.
- [x] Enforce supported escape subset (`\n \t \r \0 \\ \' \"`) for C/C++/Java.
- [x] Add optional `--semantic` payload dumping and dedicated semantic regression cases.
- [x] Verify Python in `toolchain-check`.
- [x] Keep Flex symbol prefixing, reentrant scanners, and YYSTYPE/Bison guard work deferred.

---

## Milestone 3: Syntax Analyzer & Error Recovery (Bison)

### Objective
Implement the LALR(1) parser using Bison to parse the token stream according to the Section 5 grammar, report syntax errors with line numbers, and provide basic error recovery.

### Target Deliverables
- `src/parser/parser.y`: Bison grammar file with `%union`, `%token`, `%type`, `%left`, `%right`, `%nonassoc` declarations.
- Custom `yyerror(const char *msg)` reporting line number from `yylineno`.

### Acceptance Checks
- [ ] Bison compiles `parser.y` with zero shift/reduce and zero reduce/reduce conflicts.
- [ ] Parses valid programs, including variable declarations, assignments, arithmetic expressions, control flow, and nested blocks.
- [ ] Reports syntax errors with line numbers when grammar rules are violated.
- [ ] Basic error recovery (using Bison `error` tokens) allows the parser to recover and continue past an invalid statement to report subsequent issues.

### Suggested Commit Messages
- `feat(parser): implement bison grammar skeleton and token declarations`
- `feat(parser): add expression rules with precedence declarations`
- `feat(parser): add statement rules for declarations, assignments, if-else, while, and print`
- `feat(parser): implement syntax error reporting with line numbers and basic error recovery`
- `test(parser): add valid and invalid syntax test cases`

---

## Milestone 4: Abstract Syntax Tree (AST)

### Objective
Design and implement an explicit Abstract Syntax Tree (AST) in C that captures the semantic essence of parsed programs without syntax artifacts (parentheses, commas, semicolons).

### Target Deliverables
- `src/ast/ast.h`: AST node type definitions, union payloads, and constructor signatures.
- `src/ast/ast.c`: Node allocation, linking, and hierarchical indentation pretty-printing (`ast_print`).
- Updated `src/parser/parser.y`: Semantic actions creating AST nodes and attaching them to `$$`.

### Acceptance Checks
- [ ] Dedicated AST nodes created for: `AST_PROGRAM`, `AST_VAR_DECL`, `AST_ASSIGN`, `AST_BINARY_OP`, `AST_UNARY_OP`, `AST_IF`, `AST_WHILE`, `AST_PRINT`, `AST_BLOCK`, `AST_LITERAL`, `AST_IDENTIFIER`.
- [ ] Parser builds and returns the root `AST_PROGRAM` upon successful parse.
- [ ] Indented text visualizer (`ast_print(root)`) cleanly displays the full program hierarchy.
- [ ] Memory management routines (`ast_free(root)`) recursively reclaim all allocated AST nodes.

### Suggested Commit Messages
- `feat(ast): define AST node structures and constructor function prototypes`
- `feat(ast): implement AST node allocation, memory cleanup, and tree pretty-printer`
- `feat(parser): integrate AST construction actions into grammar production rules`
- `test(ast): verify correct AST generation and visual layout on sample programs`

---

## Milestone 5: Scoped Symbol Table

### Objective
Implement a multi-scope symbol table tracking declared variables, their types, declaration line numbers, and block nesting depth.

### Target Deliverables
- `src/symbol_table/symbol_table.h`: Data structures for symbol entries and scope frames.
- `src/symbol_table/symbol_table.c`: Scope push/pop, symbol insertion, current-scope lookup, and ancestral-scope lookup.

### Acceptance Checks
- [ ] Records identifier name, data type (`TYPE_INT`, `TYPE_FLOAT`, `TYPE_BOOL`), scope level, and declaration line number.
- [ ] `enter_scope()` creates a new nested lexical scope frame.
- [ ] `exit_scope()` closes the current scope and frees local symbols.
- [ ] `lookup_current_scope(name)` verifies if a symbol is already declared in the current block (for redeclaration checks).
- [ ] `lookup_all_scopes(name)` traverses outward from the innermost block to the global scope (for resolution).
- [ ] Verifies variable isolation: inner-scope variables cannot be accessed after exiting the block.

### Suggested Commit Messages
- `feat(symbol-table): design scoped symbol entry and chained scope structures`
- `feat(symbol-table): implement enter_scope, exit_scope, insert, and hierarchical lookup`
- `test(symbol-table): add unit tests for nested scoping, shadowing, and isolation`

---

## Milestone 6: Semantic Analysis & Type Checking

### Objective
Implement an AST visitor that walks the tree, interacts with the scoped symbol table, and enforces all mandatory semantic constraints from Section 4.5.

### Target Deliverables
- `src/semantic/semantic.h`: Semantic analysis API.
- `src/semantic/semantic.c`: Recursive AST visitor implementing type checking and scope verification.

### Acceptance Checks
- [ ] Detects and reports **Rule 1: Undeclared variable use** with line number.
- [ ] Detects and reports **Rule 2: Redeclaration in same scope** with line number.
- [ ] Detects and reports **Rule 3: Scope violation** (variable used outside its enclosing block) with line number.
- [ ] Detects and reports **Rule 4: Type mismatch** (e.g. assigning float expression to boolean) with line number.
- [ ] Detects and reports **Rule 5: Invalid assignment** (e.g. bool assigned to int variable) with line number.
- [ ] Detects and reports **Rule 6: Invalid expressions** (e.g. applying `&&`, `||`, `!` to numeric operands) with line number.
- [ ] Accurately computes expression result types during bottom-up AST traversal.
- [ ] Emits clear, human-readable diagnostics and tracks error counts without crashing.

### Suggested Commit Messages
- `feat(semantic): scaffold semantic AST visitor and expression type evaluation`
- `feat(semantic): implement undeclared variable and redeclaration detection`
- `feat(semantic): enforce block scope boundaries and variable lifetime checks`
- `feat(semantic): add type checking for assignments, arithmetic, and logical expressions`
- `test(semantic): add test cases covering all six mandatory semantic error rules`

---

## Milestone 7: Intermediate Code Generation (Three-Address Code - TAC)

### Objective
Generate linear Three-Address Code (TAC) from the validated AST, allocating temporaries, emitting relational and arithmetic instructions, and generating control flow labels and jumps.

### Target Deliverables
- `src/tac/tac.h`: TAC instruction types, operand representation, and instruction list.
- `src/tac/tac.c`: TAC instruction emission, temporary allocator (`t0`, `t1`, ...), label allocator (`L0`, `L1`, ...), and AST code generator.

### Acceptance Checks
- [ ] Emits arithmetic TAC instructions with at most three operands: `t1 = b * 2`, `t2 = a + t1`.
- [ ] Preserves operator precedence in emitted instructions.
- [ ] Generates conditional jumps (`if t0 goto L1`) and unconditional jumps (`goto L2`) for `if`, `if-else`, and `while` loops.
- [ ] Translates `while` loops with loop-header labels, condition evaluation, conditional exit jump, and back-jump.
- [ ] Generates TAC for `print` statements (e.g., `print a`).
- [ ] Successfully compiles the Section 5.5 sample program into clean, verifiable TAC.

### Suggested Commit Messages
- `feat(tac): define intermediate representation data structures and instruction list`
- `feat(tac): implement temporary variable and label generators`
- `feat(tac): implement TAC emission for arithmetic and logical expressions`
- `feat(tac): implement TAC emission for if-else branches and while loops`
- `feat(tac): implement TAC emission for print statements and program termination`
- `test(tac): verify generated TAC against expected output for sample program`

---

## Milestone 8: Compiler Driver & Pipeline Integration

### Objective
Integrate all phases into a cohesive command-line executable (`compilecraft`) that accepts an input file, runs the pipeline sequentially, displays errors or outputs TAC, and returns proper OS exit codes.

### Target Deliverables
- `src/main.c`: CLI entry point, argument parsing (`argv[1]`), file reader, phase coordinator.
- Diagnostic reporter summarizing errors across lexer, parser, and semantic analyzer.

### Acceptance Checks
- [ ] CLI accepts a source file argument: `./compilecraft file.mc`.
- [ ] Executes pipeline: Lexer -> Parser -> AST -> Symbol Table -> Semantic Analysis -> TAC Generator.
- [ ] Aborts pipeline gracefully after syntax errors or semantic errors, suppressing invalid TAC generation.
- [ ] Returns exit code `0` on successful compilation; returns non-zero exit code (`1`) on failure.
- [ ] CLI supports optional flags: `--ast` (print AST), `--symtab` (dump symbol table), `-o <file>` (output TAC to file).

### Suggested Commit Messages
- `feat(driver): implement main CLI driver coordinating all compiler phases`
- `feat(driver): add command-line flag handling for AST and symbol table inspection`
- `feat(driver): ensure robust error handling and process exit status codes`

---

## Milestone 9: Automated Regression Test Suite

### Objective
Build an automated test suite under `tests/` covering all valid language constructs and every mandatory error case, paired with expected output files.

### Target Deliverables
- `tests/valid/`: Valid test programs and `.expected` TAC files (including Section 5.5 program).
- `tests/lexical_errors/`: Tests for invalid characters and malformed tokens.
- `tests/syntax_errors/`: Tests for missing semicolons, unbalanced braces, malformed statements.
- `tests/semantic_errors/`: Dedicated tests for each of the 6 mandatory semantic error rules.
- `mingw32-make test`: Automated test target diffing actual vs expected output.

### Acceptance Checks
- [ ] `mingw32-make test` runs all tests and reports pass/fail summary.
- [ ] Valid programs pass through to TAC without errors.
- [ ] Every error test correctly triggers the intended error message and line number.
- [ ] Automated regression check ensures no unexpected regressions occur during changes.

### Suggested Commit Messages
- `test(suite): create test directories and valid program test suite`
- `test(suite): add test cases for lexical errors and syntax errors`
- `test(suite): add targeted test cases for all six mandatory semantic rules`
- `test(automation): add test runner script with automated diff verification`

---

## Milestone 10: Technical Documentation & Architecture Report

### Objective
Document the complete formal grammar, pipeline architecture, symbol table scoping model, TAC generation strategy, and test matrix.

### Target Deliverables
- `docs/grammar.md`: Formal BNF specification.
- `docs/architecture.md`: Pipeline architecture and data flow diagrams.
- `docs/test_report.md`: Verification matrix across all valid and invalid test cases.

### Acceptance Checks
- [ ] Formal CFG completely covers Section 5 language features.
- [ ] Architecture document accurately reflects the implemented AST and TAC structures.

---

## Planned Visual Interface Components

### Visual Front-End (`frontend/` [Planned])
- Interactive web/desktop visual user interface for source code editing, real-time lexical/syntax token stream inspection, AST graph visualization, and TAC output display.

### Visual Back-End (`backend/` [Planned])
- Interface API and compilation service connecting the interactive front-end to CompileCraft language compiler engines (`C_Compiler/`, `CPP_Compiler/`, `Java_Compiler/`).
