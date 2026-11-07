# CompileCraft Lexical Token Specification

> **Project**: CompileCraft — Mini Programming Language Compiler Front-End  
> **Milestone**: Milestone 1 — Formal Grammar and Token Specification  
> **Authoritative Specification**: Language Specification (Section 5)  
> **Target Tool**: Flex (Fast Lexical Analyzer Generator) & GNU Bison

---

## 1. Overview

This document specifies all lexical tokens, regular expressions, lexeme representations, whitespace and comment handling, and error diagnostic policies for **CompileCraft**.

The token definitions adhere to the following conventions:
- **Shared Naming Convention**: Token names are uppercase identifiers prefixed with category tags (e.g., `KW_` for keywords) matching Bison's `%token` declarations.
- **Precedence Rule**: Flex resolves matching conflicts using the **longest-match rule** and **first-rule-first** priority. Keywords are ordered prior to generic identifier patterns.
- **Accurate Line Tracking**: The lexer maintains line counter `yylineno` across code, comments, and whitespace.

---

## 2. Complete Token Inventory

### 2.1 Keywords (Section 4.1, 5.1, 5.2)
All keywords are reserved and matched case-sensitively in lowercase.

| Keyword | Bison Token Macro | Regular Expression | Semantic Meaning | Example |
|---|---|---|---|---|
| `int` | `KW_INT` | `int` | 32-bit signed integer type | `int x;` |
| `float` | `KW_FLOAT` | `float` | Floating-point type | `float f;` |
| `bool` | `KW_BOOL` | `bool` | Boolean truth-value type | `bool flag;` |
| `if` | `KW_IF` | `if` | Conditional branch keyword | `if (x > 0)` |
| `else` | `KW_ELSE` | `else` | Alternative branch keyword | `else { ... }` |
| `while` | `KW_WHILE` | `while` | Iteration loop keyword | `while (flag)` |
| `print` | `KW_PRINT` | `print` | Standard output statement | `print y;` |
| `true` | `KW_TRUE` | `true` | Boolean true constant | `flag = true;` |
| `false` | `KW_FALSE` | `false` | Boolean false constant | `flag = false;` |

### 2.2 Identifiers (Section 5.4)
- **Token Name**: `IDENTIFIER`
- **Pattern**: `[a-zA-Z_][a-zA-Z0-9_]*`
- **Semantic Payload**: Allocated string (`char *` via `strdup(yytext)`).
- **Rules**:
  - Must begin with an ASCII letter (`a-z`, `A-Z`) or an underscore (`_`).
  - Subsequent characters may be letters, decimal digits (`0-9`), or underscores.
  - Reserved keywords (`int`, `while`, etc.) cannot be used as identifiers.

### 2.3 Numeric & Boolean Literals (Section 5.4)

| Literal Category | Bison Token Macro | Flex Regular Expression | Semantic Value | Examples |
|---|---|---|---|---|
| **Integer Literal** | `INT_LITERAL` | `[0-9]+` | `int` (`atoi(yytext)`) | `0`, `42`, `1000` |
| **Float Literal** | `FLOAT_LITERAL` | `[0-9]+\.[0-9]+` | `double` (`atof(yytext)`) | `0.0`, `3.14`, `10.5` |
| **Boolean Literal** | `KW_TRUE`, `KW_FALSE` | `true` \| `false` | `int` (`1` / `0`) | `true`, `false` |

*Note on Numeric Literals*:
- Integers are non-empty sequences of decimal digits.
- Floating-point literals require at least one digit before and after the decimal point (`[0-9]+\.[0-9]+`).
- Negative numbers (e.g. `-5`, `-3.14`) are handled as unary negation expressions in the parser rather than signed tokens.

### 2.4 Operators (Section 5.3)

| Category | Lexeme | Bison Token Macro | Description |
|---|:---:|---|---|
| **Arithmetic** | `+` | `PLUS` | Binary Addition |
| | `-` | `MINUS` | Binary Subtraction / Unary Negation |
| | `*` | `STAR` | Multiplication |
| | `/` | `SLASH` | Division |
| | `%` | `MOD` | Integer Modulo |
| **Relational** | `<` | `LT` | Less than |
| | `>` | `GT` | Greater than |
| | `<=` | `LE` | Less than or equal to |
| | `>=` | `GE` | Greater than or equal to |
| | `==` | `EQ` | Equality comparison |
| | `!=` | `NE` | Inequality comparison |
| **Logical** | `&&` | `AND` | Short-circuit Logical AND |
| | `\|\|` | `OR` | Short-circuit Logical OR |
| | `!` | `NOT` | Logical NOT (negation) |
| **Assignment** | `=` | `ASSIGN` | Assignment operator |

### 2.5 Delimiters & Punctuation (Section 5.4)

| Symbol | Bison Token Macro | Description |
|:---:|---|---|
| `{` | `LBRACE` | Compound block opening delimiter |
| `}` | `RBRACE` | Compound block closing delimiter |
| `(` | `LPAREN` | Condition / expression group open delimiter |
| `)` | `RPAREN` | Condition / expression group close delimiter |
| `;` | `SEMICOLON` | Statement terminator |

---

## 3. Non-Tokenized Elements (Comments & Whitespace)

In accordance with Section 4.1 of the manual, comments and whitespace must be **discarded** and not passed to the parser:

### 3.1 Whitespace Handling
- **Pattern**: `[ \t\r]+` (spaces, tabs, carriage returns).
- **Action**: Discard silently without action.
- **Newlines**: `\n` increments the internal line counter:
  ```lex
  \n { yylineno++; }
  ```
  *(Or enable Flex option `%option yylineno`).*

### 3.2 Single-Line Comments
- **Pattern**: `//[^\n]*`
- **Action**: Matches `//` through the end of the line. The trailing `\n` is left to be handled by the newline rule or consumed with line count adjustment.

### 3.3 Multi-Line Block Comments
- **Pattern**: `/\*([^*]|\*+[^*/])*\*+/`
- **Action**: Matches standard C-style block comments `/* ... */`. The lexer traverses the matched text to count embedded newline characters (`\n`) and correctly increment `yylineno`.
- **Unterminated Block Comment**: If an unclosed `/*` reaches End-Of-File (`<<EOF>>`), a lexical error is reported:
  ```
  Lexical Error at line %d: Unterminated block comment
  ```

---

## 4. Lexical Error Handling & Diagnostic Policy

### 4.1 Invalid Character Detection
Any character in the input stream that does not match a valid keyword, identifier, literal, operator, delimiter, whitespace, or comment rule matches the fallback rule (`.`):

```lex
. {
    fprintf(stderr, "Lexical Error at line %d: Unrecognized character '%c'\n",
            yylineno, yytext[0]);
    lexical_error_count++;
}
```

### 4.2 Malformed Number Handling
- **Missing fractional part** (e.g. `3.`): Matches `[0-9]+\.` which does not satisfy `FLOAT_LITERAL`. The scanner matches integer `3` and unexpected character `.`.
- **Leading decimal point without integer part** (e.g. `.5`): Matches unexpected character `.` followed by integer `5`.
- **Multiple decimal points** (e.g. `3.14.15`): Matches float `3.14` followed by unexpected character `.` and integer `15`.

---

## 5. Token Acceptance & Rejection Examples

### 5.1 Accepted Token Examples

| Lexeme | Token Produced | Semantic Value / Value Captured |
|---|---|---|
| `while` | `KW_WHILE` | N/A |
| `while_count` | `IDENTIFIER` | `"while_count"` (keyword prefix within identifier) |
| `_temp1` | `IDENTIFIER` | `"_temp1"` (leading underscore allowed) |
| `1024` | `INT_LITERAL` | `1024` |
| `3.14159` | `FLOAT_LITERAL` | `3.14159` |
| `0.0` | `FLOAT_LITERAL` | `0.0` |
| `==` | `EQ` | N/A |
| `<=` | `LE` | N/A |
| `&&` | `AND` | N/A |
| `// loop start` | *(None)* | Comment discarded |
| `/* multi\nline */` | *(None)* | Comment discarded, line count incremented |

### 5.2 Rejected / Lexical Error Examples

| Input Sequence | Lexer Behavior | Diagnostic Output |
|---|---|---|
| `@variable` | `@` rejected | `Lexical Error at line 1: Unrecognized character '@'` |
| `x = 5 $ 2;` | `$` rejected | `Lexical Error at line 1: Unrecognized character '$'` |
| `a # b;` | `#` rejected | `Lexical Error at line 1: Unrecognized character '#'` |
| `int ~x;` | `~` rejected | `Lexical Error at line 1: Unrecognized character '~'` |
| `/* unclosed` | `<<EOF>>` reached in comment | `Lexical Error at line 1: Unterminated block comment` |

---

## 6. Shared Token Header Reference (`tokens.h`)

## 6. Authoritative Token Definition Strategy (`tokens.def` & `tokens.h`)

To avoid desynchronization and independently maintained, conflicting token numbers between the Lexer (`src/lexer/`) and future Bison Parser (`src/parser/`), CompileCraft adopts a single authoritative token master table using X-macros in `src/lexer/tokens.def`:

```c
/* src/lexer/tokens.def */
TOKEN_DEF(KW_INT,          258, "KW_INT")
TOKEN_DEF(KW_FLOAT,        259, "KW_FLOAT")
TOKEN_DEF(KW_BOOL,         260, "KW_BOOL")
TOKEN_DEF(KW_IF,           261, "KW_IF")
TOKEN_DEF(KW_ELSE,         262, "KW_ELSE")
TOKEN_DEF(KW_WHILE,        263, "KW_WHILE")
TOKEN_DEF(KW_PRINT,        264, "KW_PRINT")
TOKEN_DEF(KW_TRUE,         265, "KW_TRUE")
TOKEN_DEF(KW_FALSE,        266, "KW_FALSE")

TOKEN_DEF(IDENTIFIER,      267, "IDENTIFIER")
TOKEN_DEF(INT_LITERAL,     268, "INT_LITERAL")
TOKEN_DEF(FLOAT_LITERAL,   269, "FLOAT_LITERAL")

TOKEN_DEF(PLUS,            270, "PLUS")
TOKEN_DEF(MINUS,           271, "MINUS")
TOKEN_DEF(STAR,            272, "STAR")
TOKEN_DEF(SLASH,           273, "SLASH")
TOKEN_DEF(MOD,             274, "MOD")

TOKEN_DEF(LT,              275, "LT")
TOKEN_DEF(GT,              276, "GT")
TOKEN_DEF(LE,              277, "LE")
TOKEN_DEF(GE,              278, "GE")
TOKEN_DEF(EQ,              279, "EQ")
TOKEN_DEF(NE,              280, "NE")

TOKEN_DEF(AND,             281, "AND")
TOKEN_DEF(OR,              282, "OR")
TOKEN_DEF(NOT,             283, "NOT")

TOKEN_DEF(ASSIGN,          284, "ASSIGN")

TOKEN_DEF(LBRACE,          285, "LBRACE")
TOKEN_DEF(RBRACE,          286, "RBRACE")
TOKEN_DEF(LPAREN,          287, "LPAREN")
TOKEN_DEF(RPAREN,          288, "RPAREN")
TOKEN_DEF(SEMICOLON,       289, "SEMICOLON")
```

From this single source of truth:
1. `src/lexer/tokens.h` defines the Bison-compatible `enum yytokentype` guarded by `YYTOKENTYPE` (preventing macro collision and duplicate type errors when Bison's `parser.tab.h` is generated).
2. `src/lexer/tokens.c` automatically implements `const char *token_name(int token)` with 100% complete switch coverage and zero duplication.
3. The future Bison grammar (`src/parser/parser.y`) maps directly to these canonical token IDs, ensuring seamless, zero-conflict integration in Milestone 3.

