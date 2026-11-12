# CompileCraft Java-Subset Lexical Token Specification

> **Project**: CompileCraft — Java Front-End (`Java_Compiler/`)
> **Milestone**: Milestone 2.3 — Java-Subset Lexical Analyzer
> **Target Standard**: Java SE Class-Enclosed Object-Oriented Subset
> **Target Tools**: Flex 2.6.4 & GNU Bison 3.8.2 (MSYS2 UCRT64)

---

## 1. Overview and Target Standard

The **CompileCraft-Java** front-end processes a statically typed, class-enclosed object-oriented subset of **Java SE**.

### Target Java Subset Boundaries
- **Supported Paradigms**: Strictly class-enclosed OOP (`public class Main { public static void main(String[] args) { ... } }`), instance creation via `new`, `this`, and field/method access via `.`.
- **Identifiers**: `System`, `out`, `println`, `String`, and `main` are treated as normal identifiers (`IDENTIFIER`), **not** keywords.
- **I/O Model**: Method invocation style, e.g. `System.out.println(expr);`.
- **Exclusions**: Interfaces, packages/imports, `try-catch` exceptions, generics (`List<T>`), and JVM bytecode emission (Java compiles directly to TAC).

---

## 2. Token Inventory

### 2.1 Keywords
Keywords are reserved, case-sensitive, and lowercase:

| Keyword | Bison Token Macro | Category | Description |
|---|---|---|---|
| `int` | `KW_INT` | Type Specifier | 32-bit signed integer |
| `float` | `KW_FLOAT` | Type Specifier | Single-precision floating point |
| `char` | `KW_CHAR` | Type Specifier | 16-bit character (lexeme level) |
| `void` | `KW_VOID` | Type Specifier | Empty type / method return |
| `boolean` | `KW_BOOLEAN` | Type Specifier | Boolean type |
| `true` | `KW_TRUE` | Boolean Literal | Boolean true constant |
| `false` | `KW_FALSE` | Boolean Literal | Boolean false constant |
| `if` | `KW_IF` | Control Flow | Conditional branch |
| `else` | `KW_ELSE` | Control Flow | Alternative branch |
| `while` | `KW_WHILE` | Iteration | While loop |
| `for` | `KW_FOR` | Iteration | For loop |
| `return` | `KW_RETURN` | Control Flow | Method return |
| `class` | `KW_CLASS` | OOP Specifier | Class definition |
| `public` | `KW_PUBLIC` | Access Modifier | Public visibility |
| `static` | `KW_STATIC` | Modifier | Static member / method |
| `new` | `KW_NEW` | Memory Management | Object instantiation |
| `this` | `KW_THIS` | OOP Reference | Current object reference |

*(Note: `System`, `out`, `println`, `String`, and `main` are standard identifiers, not language keywords).*

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
- **Supported Escape Sequences** (CompileCraft Java subset; `\0` is retained as a subset extension rather than full Java octal escapes):
  - `\'` : Single quote (ASCII 39)
  - `\"` : Double quote (ASCII 34)
  - `\\` : Backslash (ASCII 92)
  - `\n` : Newline (ASCII 10)
  - `\t` : Tab (ASCII 9)
  - `\r` : Carriage return (ASCII 13)
  - `\0` : Null byte (ASCII 0)
- Unsupported escapes (for example `\q`) are rejected with `Invalid escape sequence`.

### 2.5 String Literals (`STRING_LITERAL`)
- **Format**: Delimited by double quotes (`"..."`).
- **Contents**: Printable characters and the supported escape subset above.
- **Memory**: The scanner preserves the lexeme string safely on the heap (`strdup`), released by the driver.

### 2.6 Operators

| Category | Lexeme | Token Macro | Description |
|---|:---:|---|---|
| **Member Access** | `.` | `DOT` | Field / method access (e.g. `System.out.println`) |
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
| `{` | `LBRACE` | Class / method / block body start |
| `}` | `RBRACE` | Class / method / block body end |
| `(` | `LPAREN` | Grouping / parameter open |
| `)` | `RPAREN` | Grouping / parameter close |
| `[` | `LBRACKET` | Array type / indexing open |
| `]` | `RBRACKET` | Array type / indexing close |
| `;` | `SEMICOLON` | Statement terminator |
| `,` | `COMMA` | Argument / declaration separator |

---

## 3. Whitespace and Comments

### 3.1 Whitespace
- `[ \t\r]+` is discarded without action.
- `\n` advances `yylineno`. Both CRLF (`\r\n`) and LF (`\n`) are supported.

### 3.2 Comments
- Single-line comments: `"//"[^\n]*` discarded.
- Block comments: `"/*"` enters exclusive state `%x COMMENT` until `"*/"`, tracking lines across newlines.
- Unterminated block comment at EOF triggers:
  `Lexical Error at line %d: Unterminated block comment`

---

## 4. Lexical Error Policy

| Fault Condition | Scanner Behavior | Diagnostic Output |
|---|---|---|
| Invalid character (`@`, `$`, `~`, mid-line `#`) | Report error, skip character | `Lexical Error at line %d: Unrecognized character '%c'` |
| Invalid escape sequence (`\q`, etc.) | Report error, skip literal | `Lexical Error at line %d: Invalid escape sequence` |
| Unterminated block comment | Report error at comment start line, exit scanning | `Lexical Error at line %d: Unterminated block comment` |
| Unterminated string literal | Report error, skip to end of line | `Lexical Error at line %d: Unterminated string literal` |
| Unterminated character literal | Report error, skip to end of line | `Lexical Error at line %d: Unterminated character literal` |
| Empty character literal (`''`) | Report error | `Lexical Error at line %d: Empty character literal` |
| Multi-character literal (`'ab'`) | Report error | `Lexical Error at line %d: Multi-character literal is unsupported` |
| Note on `3.` or `.5` | In Java, `.` is the valid member access token `DOT`. Sequences like `3.` or `.5` tokenize as integer literal and `DOT` operator; syntactic validity is enforced by the parser. | N/A (Lexically valid tokens) |
