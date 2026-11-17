# CompileCraft Baseline Parser Notes

> **Milestone**: 3.3 — Parser Hardening
>
> **Artifact**: `bin/compilecraft-parser.exe`
>
> **Grammar**: `src/parser/parser.y` (baseline mini-language only)

---

## Status

| Milestone | Status |
|---|---|
| **M3.2** Baseline Bison parser | **Complete** |
| **M3.3** Parser hardening | **Complete** |
| **M4** AST construction | Not started (intentionally deferred) |

C / C++ / Java front ends remain **lexer-only**. Only the baseline mini-language (`.mc`) has a parser.

---

## Diagnostics (M3.3)

- Bison options: `%define parse.error detailed` and `%define parse.lac full`
- Messages: `Syntax Error at line N: …` with unexpected / expected token text when LAC can determine it
- Lexical errors remain `Lexical Error at line N: …` from the Flex scanner
- Consecutive identical diagnostics at the same line are suppressed
- Exit code is `1` if `yyparse` fails **or** `syntax_error_count > 0` **or** `lexical_error_count > 0`

Success stdout (unchanged): `Syntax validation successful.`

---

## Error Recovery Design

Synchronization points (no `%expect`; conflicts fail the build):

1. **Semicolon sync** — `error SEMICOLON` (`error_stmt`) for malformed statements / missing `;`
2. **Brace sync** — `LBRACE statement_list error RBRACE` for malformed nested-block content
3. **Condition sync** — `KW_IF/KW_WHILE LPAREN error RPAREN …` so empty/malformed conditions do not cascade into brace diagnostics
4. **EOF sync** — `program: statement_list error` for incomplete constructs at end of file

`yyerrok` is called after each recovery production so later independent errors are reported.

---

## Conflict Enforcement

`Makefile` passes:

```text
BISONFLAGS = -d -v -Werror=conflicts-sr -Werror=conflicts-rr
```

Unresolved shift/reduce or reduce/reduce conflicts fail the build. `%expect` is not used.

---

## Memory Ownership

| Path | Ownership |
|---|---|
| Lexer `IDENTIFIER` | `yylval.sval = strdup(yytext)` in `src/lexer/lexer.l` |
| Successful decl/assign | `free($n)` in the reduction action that consumes the identifier |
| Successful primary expr | `IDENTIFIER → expression` frees `$1`; `expression` carries no pointer |
| Error discard | `%destructor { free($$); } <sval>` runs only for popped/discarded `<sval>` tokens |
| `yylval` definition | Parser link uses `-DBISON_OWNS_YYLVAL`; standalone lexer defines `yylval` in `tokens.c` |
| EOF / `yylex_destroy` | Scanner teardown after parse; no extra sval retained by the driver |

AddressSanitizer is **not** available in the verified MSYS2 UCRT64 toolchain (`-lasan` missing). Ownership is reviewed statically; runtime leak-freedom is **not** claimed.
