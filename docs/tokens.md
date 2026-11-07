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
    fprintf(stderr, "Lexical Error at line %d: Unrecognized character '%c' (0x%02X)\n",
            yylineno, yytext[0], (unsigned char)yytext[0]);
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

For clean modularity between Flex (`src/lexer/`) and Bison (`src/parser/`), token macros are generated by Bison (`parser.tab.h`) using the standardized names:

```c
#ifndef TOKENS_H
#define TOKENS_H

/* Keywords */
#define KW_INT       258
#define KW_FLOAT     259
#define KW_BOOL      260
#define KW_IF        261
#define KW_ELSE      262
#define KW_WHILE     263
#define KW_PRINT     264
#define KW_TRUE      265
#define KW_FALSE     266

/* Identifiers & Literals */
#define IDENTIFIER   267
#define INT_LITERAL  268
#define FLOAT_LITERAL 269

/* Operators */
#define PLUS         270
#define MINUS        271
#define STAR         272
#define SLASH        273
#define MOD          274
#define LT           275
#define GT           276
#define LE           277
#define GE           278
#define EQ           279
#define NE           280
#define AND          281
#define OR           282
#define NOT          283
#define ASSIGN       284

/* Delimiters */
#define LBRACE       285
#define RBRACE       286
#define LPAREN       287
#define RPAREN       288
#define SEMICOLON    289

#endif /* TOKENS_H */
```
*(When Bison builds `src/parser/parser.y`, it generates equivalent enumerations automatically in `parser.tab.h`).*

