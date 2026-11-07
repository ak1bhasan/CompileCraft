# Technical Requirements Specification

> **Project**: CompileCraft — Multi-Language Compiler Front-End (C, C++, Java)  
> **Reference**: Language Specification & Architectural Decision DEC-13  
> **Status**: Multi-Frontend Architecture Baseline (Milestone 2 Re-alignment)

---

## 1. Traceability Matrix Overview

| Requirement Area | Target Languages | Primary Target Module / Location | Verification Method |
|---|---|---|---|
| **Core Lexical Analysis (Baseline)** | Simplified Mini-Language | `src/lexer/` (`lexer.l`) | Verified with 17 automated tests |
| **C Lexical & Syntax Analysis** | C Subset (`.c`) | `src/frontend_c/` (`lexer.l`, `parser.y`) | C test suite & AST generation |
| **C++ Lexical & Syntax Analysis** | C++ Subset (`.cpp`) | `src/frontend_cpp/` (`lexer.l`, `parser.y`) | C++ test suite & AST generation |
| **Java Lexical & Syntax Analysis** | Java Subset (`.java`) | `src/frontend_java/` (`lexer.l`, `parser.y`) | Java test suite & AST generation |
| **Abstract Syntax Tree (AST)** | Shared Core + Extensions | `src/common/ast/` (`ast.h`, `ast.c`) | Hierarchical AST inspection |
| **Symbol Table & Scoping** | Shared Core + OOP scopes | `src/common/symbol_table/` | Nested scopes & class table tests |
| **Semantic Analysis** | Language-specific rules | `src/semantic/` | Type & scope constraint checks |
| **Intermediate Code (TAC)** | Shared Unified IR | `src/common/tac/` | Clean Three-Address Code output |
| **Testing Suite** | All three languages | `tests/` (`tests/run_tests.py`) | Automated multi-language runner |
| **Toolchain & Build** | Unified Build | `Makefile` | Multi-target build and clean recipes |

---

## 2. Compiler Pipeline Requirements

### 2.1 Lexical Analyzer Baseline Module (Flex)
> *Note: This module provides the initial, verified lexical engine for the Section 5 core mini-language. It serves as the baseline for the modular C, C++, and Java lexical analyzers in Milestone 2.*
- [x] **REQ-LEX-01 (Sec 4.1, 5.1)**: Recognize language keywords: `int`, `float`, `bool`, `if`, `else`, `while`, `print`, `true`, `false`. *(Verified in Milestone 2 via `01_token_categories.mc` and `02_keyword_boundaries.mc`)*
- [x] **REQ-LEX-02 (Sec 4.1, 5.4)**: Recognize identifiers starting with a letter or underscore, followed by letters, digits, or underscores (`[a-zA-Z_][a-zA-Z0-9_]*`). *(Verified in Milestone 2)*
- [x] **REQ-LEX-03 (Sec 4.1, 5.4)**: Recognize integer literals (e.g., `42`, `0`, `100`). *(Verified in Milestone 2 via `04_numeric_literals.mc`)*
- [x] **REQ-LEX-04 (Sec 4.1, 5.4)**: Recognize floating-point literals (e.g., `3.14`, `0.5`, `10.0`). *(Verified in Milestone 2 via `04_numeric_literals.mc`)*
- [x] **REQ-LEX-05 (Sec 4.1, 5.4)**: Recognize boolean literal tokens: `true` and `false`. *(Verified in Milestone 2)*
- [x] **REQ-LEX-06 (Sec 4.1, 5.3)**: Recognize arithmetic operators: `+`, `-`, `*`, `/`, `%`. *(Verified in Milestone 2 via `03_operators.mc` and `05_minus_tokens.mc`)*
- [x] **REQ-LEX-07 (Sec 4.1, 5.3)**: Recognize relational operators: `<`, `>`, `<=`, `>=`, `==`, `!=`. *(Verified in Milestone 2 via `03_operators.mc`)*
- [x] **REQ-LEX-08 (Sec 4.1, 5.3)**: Recognize logical operators: `&&`, `||`, `!`. *(Verified in Milestone 2 via `03_operators.mc`)*
- [x] **REQ-LEX-09 (Sec 4.1, 5.4)**: Recognize delimiters: `{`, `}`, `(`, `)`, `;`. *(Verified in Milestone 2 via `01_token_categories.mc`)*
- [x] **REQ-LEX-10 (Sec 4.1)**: Discard single-line comments (`// ...`) without producing tokens. *(Verified in Milestone 2 via `06_comments_whitespace.mc`)*
- [x] **REQ-LEX-11 (Sec 4.1)**: Discard block comments (`/* ... */`) without producing tokens. *(Verified in Milestone 2 via `06_comments_whitespace.mc`)*
- [x] **REQ-LEX-12 (Sec 4.1)**: Discard whitespace (spaces, tabs, newlines) while accurately tracking current line numbers (`yylineno`). *(Verified in Milestone 2 via `06_comments_whitespace.mc` and `07_crlf_line_tracking.mc`)*
- [x] **REQ-LEX-13 (Sec 4.1)**: Detect and report any invalid character/token as a lexical error with line number, continuing scanning where possible. *(Verified in Milestone 2 via `error_invalid_char.mc`, `error_malformed_float_*.mc`, `error_multiple_chars.mc`, and `error_unterminated_comment.mc`)*
- [x] **REQ-LEX-14 (Sec 4.1 Tip)**: Define keyword patterns before general identifier patterns to leverage Flex's longest-match rule. *(Verified in Milestone 2 via `02_keyword_boundaries.mc`)*

### 2.2 Syntax Analyzer Module (Bison)
- [ ] **REQ-SYN-01 (Sec 4.2, 5)**: Implement a complete, formal, unambiguous Context-Free Grammar (CFG) for the language defined in Section 5.
- [ ] **REQ-SYN-02 (Sec 4.2)**: Eliminate shift/reduce and reduce/reduce conflicts through explicit operator precedence and associativity rules (`%left`, `%right`, `%nonassoc`).
- [ ] **REQ-SYN-03 (Sec 4.2)**: Support variable declarations (`int x;`, `float y;`, `bool flag;`).
- [ ] **REQ-SYN-04 (Sec 4.2)**: Support assignment statements (`x = 10;`, `flag = true;`).
- [ ] **REQ-SYN-05 (Sec 4.2)**: Support expression statements containing arithmetic, relational, and logical operations with standard algebraic precedence.
- [ ] **REQ-SYN-06 (Sec 4.2, 5.2)**: Support control flow statements: `if (cond) stmt`, `if (cond) stmt else stmt`, and `while (cond) stmt`.
- [ ] **REQ-SYN-07 (Sec 4.2, 5.2)**: Support `print` statement (e.g., `print expr;`).
- [ ] **REQ-SYN-08 (Sec 4.2, 5.2)**: Support nested block statements enclosed in braces (`{ ... }`).
- [ ] **REQ-SYN-09 (Sec 4.2)**: Detect syntax violations and report human-readable syntax errors with exact line numbers (`yyerror`).
- [ ] **REQ-SYN-10 (Sec 4.2)**: Implement basic syntax error recovery (using Bison's `error` token) to avoid halting compilation on the first syntax fault.

### 2.3 Abstract Syntax Tree (AST) Module
- [ ] **REQ-AST-01 (Sec 4.3)**: Construct AST nodes dynamically during parsing as grammar productions succeed.
- [ ] **REQ-AST-02 (Sec 4.3)**: Implement distinct node types representing meaningful constructs (`VarDeclNode`, `AssignNode`, `BinaryOpNode`, `UnaryOpNode`, `IfNode`, `WhileNode`, `PrintNode`, `BlockNode`, `LiteralNode`, `VarRefNode`).
- [ ] **REQ-AST-03 (Sec 4.3)**: Strip all syntactic boilerplate (parentheses, semicolons, redundant grouping) from AST representations.
- [ ] **REQ-AST-04 (Sec 4.3)**: Pass the AST root as the central data contract to both the Semantic Analyzer and Intermediate Code Generator.
- [ ] **REQ-AST-05 (Sec 4.3)**: Provide an AST pretty-printer displaying hierarchical indented textual trees for debugging and inspection.

### 2.4 Symbol Table Module
- [ ] **REQ-SYM-01 (Sec 4.4)**: Track every declared identifier with at least: Name, Type (`int`, `float`, `bool`), Scope level/identifier, and Line declared.
- [ ] **REQ-SYM-02 (Sec 4.4)**: Support lexical nested scopes triggered by `{ ... }` blocks (e.g., inside `if` and `while` blocks).
- [ ] **REQ-SYM-03 (Sec 4.4)**: Enforce scope isolation: variables declared inside inner blocks must not be visible outside that block.
- [ ] **REQ-SYM-04 (Sec 4.4)**: Support variable shadowing: an inner block variable may shadow an outer variable of the same name without corrupting the outer scope.
- [ ] **REQ-SYM-05 (Sec 4.4)**: Implement clean scope entry (`enter_scope()`) and scope exit (`exit_scope()`) lifecycle operations.

### 2.5 Semantic Analyzer Module
- [ ] **REQ-SEM-01 (Sec 4.5)**: Walk the AST recursively and validate semantic rules that the CFG cannot enforce.
- [ ] **REQ-SEM-02 (Sec 4.5 Rule 1)**: Detect and report **Undeclared Variable Use** (using an identifier before declaring it in current or ancestor scope).
- [ ] **REQ-SEM-03 (Sec 4.5 Rule 2)**: Detect and report **Redeclaration Error** (declaring an identifier twice in the exact same scope).
- [ ] **REQ-SEM-04 (Sec 4.5 Rule 3)**: Detect and report **Scope Violation** (accessing an identifier outside its declared block lifecycle).
- [ ] **REQ-SEM-05 (Sec 4.5 Rule 4)**: Detect and report **Type Mismatch** (e.g., assigning a float/arithmetic result to a bool without valid conversion).
- [ ] **REQ-SEM-06 (Sec 4.5 Rule 5)**: Detect and report **Invalid Assignment** (assigning incompatible types, such as boolean expression to integer variable).
- [ ] **REQ-SEM-07 (Sec 4.5 Rule 6)**: Detect and report **Invalid Expressions** (e.g., applying logical operators `&&`, `||`, `!` to numeric operands).
- [ ] **REQ-SEM-08 (Sec 4.5)**: Output clear, descriptive, human-readable error messages containing line numbers for every detected semantic fault.

### 2.6 Intermediate Code Generation (TAC) Module
- [ ] **REQ-TAC-01 (Sec 4.6)**: Generate linear Three-Address Code (TAC) where instructions consist of at most three operands (`dest = src1 op src2`, `dest = op src1`, or copy `dest = src`).
- [ ] **REQ-TAC-02 (Sec 4.6)**: Allocate synthetic temporary variables sequentially (`t1`, `t2`, `t3`, ...).
- [ ] **REQ-TAC-03 (Sec 4.6)**: Generate unique jump labels sequentially (`L1`, `L2`, `L3`, ...).
- [ ] **REQ-TAC-04 (Sec 4.6)**: Correctly handle arithmetic expressions while preserving operator precedence.
- [ ] **REQ-TAC-05 (Sec 4.6)**: Correctly handle relational and logical expressions.
- [ ] **REQ-TAC-06 (Sec 4.6)**: Correctly handle `if` and `if-else` control flow using conditional and unconditional jump instructions (`if cond goto L_true`, `goto L_end`, `label L_false:`).
- [ ] **REQ-TAC-07 (Sec 4.6)**: Correctly handle `while` loops using loop head labels, conditional exit jumps, and back-edge unconditional jumps.
- [ ] **REQ-TAC-08 (Sec 4.6)**: Correctly handle `print` statements (e.g., `print a`).
- [ ] **REQ-TAC-09 (Sec 4.6, 6)**: Terminate compilation pipeline at TAC generation. Do not emit assembly or machine code (explicitly out of scope per Section 6).

---

## 3. Authoritative Language Specification Conformance (Section 5)

- [ ] **REQ-LANG-01 (Sec 5.1)**: Support basic types: `int` (signed integer), `float` (floating-point), `bool` (boolean `true`/`false`).
- [ ] **REQ-LANG-02 (Sec 5.2)**: Support variable declarations (`int x;`).
- [ ] **REQ-LANG-03 (Sec 5.2)**: Support assignments (`x = 5;`).
- [ ] **REQ-LANG-04 (Sec 5.2, 5.3)**: Support arithmetic expressions (`+`, `-`, `*`, `/`, `%`).
- [ ] **REQ-LANG-05 (Sec 5.2, 5.3)**: Support relational expressions (`<`, `>`, `<=`, `>=`, `==`, `!=`).
- [ ] **REQ-LANG-06 (Sec 5.2, 5.3)**: Support logical expressions (`&&`, `||`, `!`).
- [ ] **REQ-LANG-07 (Sec 5.2)**: Support `if` statement and `if-else` statement.
- [ ] **REQ-LANG-08 (Sec 5.2)**: Support `while` loop statement.
- [ ] **REQ-LANG-09 (Sec 5.2)**: Support `print` statement.
- [ ] **REQ-LANG-10 (Sec 5.2)**: Support nested block statements (`{ ... }`) with scoped variable lifetimes.
- [ ] **REQ-LANG-11 (Sec 5.5)**: Successfully compile the authoritative Section 5.5 sample program without errors and produce valid TAC:
  ```c
  int x;
  int y;
  bool flag;
  x = 10;
  y = 0;
  flag = true;
  while (x > 0) {
      y = y + x;
      x = x - 1;
  }
  if (flag == true) {
      print y;
  } else {
      print x;
  }
  ```

---

## 4. Testing Requirements (Section 15)

- [ ] **REQ-TST-01 (Sec 15)**: Maintain all test cases in the `tests/` directory with structured folders.
- [ ] **REQ-TST-02 (Sec 15)**: Provide at least one non-trivial valid program that compiles cleanly all the way through to TAC.
- [ ] **REQ-TST-03 (Sec 15)**: Provide at least one program containing an invalid token, verifying correct lexical error detection and line reporting.
- [ ] **REQ-TST-04 (Sec 15)**: Provide at least one program violating the grammar, verifying correct syntax error detection and reporting.
- [ ] **REQ-TST-05 (Sec 15)**: Provide at least one dedicated test program for **Undeclared variable use** (Rule 1).
- [ ] **REQ-TST-06 (Sec 15)**: Provide at least one dedicated test program for **Redeclaration error** (Rule 2).
- [ ] **REQ-TST-07 (Sec 15)**: Provide at least one dedicated test program for **Scope violation** (Rule 3).
- [ ] **REQ-TST-08 (Sec 15)**: Provide at least one dedicated test program for **Type mismatch** (Rule 4).
- [ ] **REQ-TST-09 (Sec 15)**: Provide at least one dedicated test program for **Invalid assignment** (Rule 5).
- [ ] **REQ-TST-10 (Sec 15)**: Provide at least one dedicated test program for **Invalid expressions with logical operators** (Rule 6).
- [ ] **REQ-TST-11 (Sec 15)**: Pair each test program with an expected output file (`.expected`) and actual run output for verification.

---

## 5. Technical Deliverables & Build Requirements

- [x] **REQ-DEL-01**: Environment and toolchain verification with working 64-bit GCC, Flex, Bison, and Make.
- [x] **REQ-DEL-02**: Working `Makefile` with customizable tool overrides and clean targets.
- [ ] **REQ-DEL-03**: Complete C source code for all required modules (`src/`).
- [ ] **REQ-DEL-04**: Working `compilecraft` binary compiling from source via `mingw32-make`.
- [ ] **REQ-DEL-05**: Automated regression test suite executing via `mingw32-make test`.
- [ ] **REQ-DEL-06**: Technical documentation covering formal CFG, pipeline design, symbol table scoping, and TAC generation strategy.
