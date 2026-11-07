# CompileCraft C-Subset Lexical Token Specification

> **Project**: CompileCraft — C Front-End (`C_Compiler/`)  
> **Milestone**: Milestone 2.1 — C-Subset Lexical Analyzer  
> **Target Standard**: ISO C99 / C11 Procedural Subset  
> **Target Tools**: Flex 2.6.4 & GNU Bison 3.8.2 (MSYS2 UCRT64)

---

## 1. Overview and Target Standard

The **CompileCraft-C** front-end processes a statically typed, procedural subset of standard **C (ISO/IEC 9899:1999 / 9899:2011)**.

### Target C Subset Boundaries
- **Supported Paradigms**: Procedural programming with global and local variable declarations, function definitions, control flow, arithmetic, and assignments.
- **Identifiers**: `main` and standard I/O calls such as `printf` are treated as normal function identifiers (`IDENTIFIER`), not keywords.
- **Preprocessing Policy**: C preprocessor macros and include headers (e.g., `#include`, `#define`, `#ifdef`) are **unsupported language features** in this compiler front-end. In accordance with the language specification policy, preprocessor directives are **not** silently discarded; they are explicitly recognized and rejected with a descriptive diagnostic (`Unsupported language feature: Preprocessing directive`).
- **Feature Distinction**: Valid-but-unsupported C features (e.g., preprocessing directives) are explicitly distinguished from malformed lexical input (e.g., invalid characters `@` or unterminated string literals).

---

## 2. Token Inventory

### 2.1 Keywords
Keywords are reserved, case-sensitive, and lowercase:

| Keyword | Bison Token Macro | Category | Description |
|---|---|---|---|
| `int` | `KW_INT` | Type Specifier | 32-bit signed integer |
| `float` | `KW_FLOAT` | Type Specifier | Single-precision floating point |
| `double` | `KW_DOUBLE` | Type Specifier | Double-precision floating point |
| `char` | `KW_CHAR` | Type Specifier | 8-bit character |
| `void` | `KW_VOID` | Type Specifier | Empty type / function return |
| `if` | `KW_IF` | Control Flow | Conditional branch |
| `else` | `KW_ELSE` | Control Flow | Alternative branch |
| `while` | `KW_WHILE` | Iteration | While loop |
| `for` | `KW_FOR` | Iteration | For loop |
| `return` | `KW_RETURN` | Control Flow | Function return |
| `break` | `KW_BREAK` | Control Flow | Loop termination |
| `continue` | `KW_CONTINUE` | Control Flow | Loop iteration jump |

*(Note: `printf`, `scanf`, and `main` are standard identifiers, not language keywords).*

### 2.2 Identifiers
- **Token**: `IDENTIFIER`
- **Pattern**: `[a-zA-Z_][a-zA-Z0-9_]*`
- **Rule**: Must begin with an ASCII letter or underscore; subsequent characters may be letters, digits, or underscores. Keywords have precedence over identifiers via the longest-match and first-rule rules.

### 2.3 Numeric Literals
- **Integer Literal (`INT_LITERAL`)**: Non-negative sequence of decimal digits (`[0-9]+`).
- **Floating-Point Literal (`FLOAT_LITERAL`)**: Non-negative sequence with decimal point (`[0-9]+\.[0-9]+`).
- **No Leading Sign**: Unary minus `-` is scanned as an independent `MINUS` token. The parser determines whether `-` acts as binary subtraction or unary negation.

### 2.4 Character Literals (`CHAR_LITERAL`)
- **Format**: Delimited by single quotes (`'...'`).
- **Characters**: Printable characters except `'`, `\`, and newline `\n`.
- **Supported Escape Sequences**:
  - `\'` : Single quote (ASCII 39)
  - `\"` : Double quote (ASCII 34)
  - `\\` : Backslash (ASCII 92)
  - `\n` : Newline (ASCII 10)
  - `\t` : Tab (ASCII 9)
  - `\r` : Carriage return (ASCII 13)
  - `\0` : Null byte (ASCII 0)

### 2.5 String Literals (`STRING_LITERAL`)
- **Format**: Delimited by double quotes (`"..."`).
- **Contents**: Printable characters and supported escape sequences (`\n`, `\t`, `\r`, `\\`, `\"`, `\'`, `\0`).
- **Memory**: The scanner preserves the lexeme string safely on the heap (`strdup`), released by the consumer.

### 2.6 Operators

| Category | Lexeme | Token Macro | Description |
|---|:---:|---|---|
| **Arithmetic** | `+` | `PLUS` | Addition |
| | `-` | `MINUS` | Subtraction / Unary Negation |
| | `*` | `STAR` | Multiplication |
| | `/` | `SLASH` | Division |
| | `%` | `MOD` | Modulo |
| **Relational** | `<` | `LT` | Less than |
| | `>` | `GT` | Greater than |
| | `<=` | `LE` | Less than or equal |
| | `>=` | `GE` | Greater than or equal |
| | `==` | `EQ` | Equality |
| | `!=` | `NE` | Inequality |
| **Logical** | `&&` | `AND` | Logical AND |
| | `\|\|` | `OR` | Logical OR |
| | `!` | `NOT` | Logical NOT |
| **Assignment** | `=` | `ASSIGN` | Simple assignment |
| | `+=` | `PLUS_ASSIGN` | Additive assignment |
| | `-=` | `MINUS_ASSIGN` | Subtractive assignment |
| | `*=` | `STAR_ASSIGN` | Multiplicative assignment |
| | `/=` | `SLASH_ASSIGN` | Divisive assignment |
| | `%=` | `MOD_ASSIGN` | Modulo assignment |
| **Increment/Decrement** | `++` | `INC` | Increment |
| | `--` | `DEC` | Decrement |

### 2.7 Delimiters & Punctuation

| Lexeme | Token Macro | Description |
|:---:|---|---|
| `{` | `LBRACE` | Compound block start |
| `}` | `RBRACE` | Compound block end |
| `(` | `LPAREN` | Grouping / parameter open |
| `)` | `RPAREN` | Grouping / parameter close |
| `[` | `LBRACKET` | Array indexing open |
| `]` | `RBRACKET` | Array indexing close |
| `;` | `SEMICOLON` | Statement terminator |
| `,` | `COMMA` | Argument / declaration separator |

---

## 3. Whitespace, Comments, and Preprocessor Directives

### 3.1 Whitespace
- `[ \t\r]+` is discarded without action.
- `\n` advances `yylineno`. Both CRLF (`\r\n`) and LF (`\n`) are supported.

### 3.2 Comments
- Single-line comments: `"//"[^\n]*` discarded.
- Block comments: `"/*"` enters exclusive state `%x COMMENT` until `"*/"`, tracking lines across newlines.
- Unterminated block comment at EOF triggers:
  `Lexical Error at line %d: Unterminated block comment`

### 3.3 Preprocessing Directives
CompileCraft operates on a directive-free C subset:
- Preprocessor directives (such as `#include`, `#define`, `#pragma`) are not supported in this subset.
- Any preprocessing line starting with `#` is recognized and explicitly rejected:
  `Lexical Error at line %d: Unsupported language feature: Preprocessing directive`
- This directive-free subset policy ensures unsupported preprocessor directives are explicitly diagnosed rather than silently ignored or requiring an external preprocessor pass.

---

## 4. Lexical Error Policy

| Fault Condition | Scanner Behavior | Diagnostic Output |
|---|---|---|
| Preprocessor directive (`#include`, etc.) | Report error, skip directive line | `Lexical Error at line %d: Unsupported language feature: Preprocessing directive` |
| Invalid character (`@`, `$`, `~`) | Report error, skip character | `Lexical Error at line %d: Unrecognized character '%c'` |
| Unterminated block comment | Report error at comment start line, exit scanning | `Lexical Error at line %d: Unterminated block comment` |
| Unterminated string literal | Report error, skip to end of line | `Lexical Error at line %d: Unterminated string literal` |
| Unterminated character literal | Report error, skip to end of line | `Lexical Error at line %d: Unterminated character literal` |
| Empty character literal (`''`) | Report error | `Lexical Error at line %d: Empty character literal` |
| Multi-character literal (`'ab'`) | Report error | `Lexical Error at line %d: Multi-character literal is unsupported` |
| Malformed float missing fraction (`3.`) | Scanned as `INT_LITERAL(3)` + error for `.` | `Lexical Error at line %d: Unrecognized character '.'` |
| Malformed float leading dot (`.5`) | Scanned as error for `.` + `INT_LITERAL(5)` | `Lexical Error at line %d: Unrecognized character '.'` |

