# CompileCraft Baseline Parser Notes

> **Milestone**: 3.3 — Parser Hardening + Milestone 4 — AST Integration
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
| **M4** AST construction + `--ast` CLI | **Complete** (through M4.5 docs sync) |

C / C++ / Java front ends remain **lexer-only**. Only the baseline mini-language (`.mc`) has a parser and AST.

Design authority for the AST: `docs/ast.md`. Implementation: `src/ast/` + actions in `parser.y`.

---

## Diagnostics (M3.3)

- Bison options: `%define parse.error detailed` and `%define parse.lac full`
- Messages: `Syntax Error at line N: …` with unexpected / expected token text when LAC can determine it
- Lexical errors remain `Lexical Error at line N: …` from the Flex scanner
- Consecutive identical diagnostics at the same line are suppressed
- Exit code is `1` if `yyparse` fails **or** `syntax_error_count > 0` **or** `lexical_error_count > 0`

Default-mode success stdout (unchanged): `Syntax validation successful.`

---

## Error Recovery Design

Synchronization points (no `%expect`; conflicts fail the build):

1. **Semicolon sync** — `error SEMICOLON` (`error_stmt`) for malformed statements / missing `;`
2. **Brace sync** — `LBRACE statement_list error RBRACE` for malformed nested-block content
3. **Condition sync** — `KW_IF/KW_WHILE LPAREN error RPAREN …` so empty/malformed conditions do not cascade into brace diagnostics
4. **EOF sync** — `program: statement_list error` for incomplete constructs at end of file

`yyerrok` is called after each recovery production so later independent errors are reported.

Recovery productions free any partial AST children / lists they hold and yield `NULL`. They do **not** fabricate authoritative statement or program nodes for invalid phrases.

---

## Conflict Enforcement

`Makefile` passes:

```text
BISONFLAGS = -d -v -Werror=conflicts-sr -Werror=conflicts-rr
```

Unresolved shift/reduce or reduce/reduce conflicts fail the build. `%expect` is not used.

---

## Flex / Bison Integration (M4)

| Concern | Arrangement |
|---|---|
| **Token IDs** | Locked to `src/lexer/tokens.def` via `_Static_assert` in `src/parser/main.c` |
| **Standalone lexer** | `YYSTYPE` fallback in `tokens.h` (no AST fields); builds `compilecraft-lexer.exe` |
| **Parser-linked lexer** | `build/parser/lex.yy.o` compiled with `-include parser.tab.h` and `-Isrc/ast` so Bison `%union` owns `YYSTYPE` |
| **`yylval` definition** | Parser link uses `-DBISON_OWNS_YYLVAL`; standalone lexer defines `yylval` in `tokens.c` |
| **Locations** | `%locations` in `parser.y`; Flex `YY_USER_ACTION` updates `yylloc`; `compilecraft_loc_reset()` before each parse |

### Semantic values (`%union`)

```c
%union {
    int ival;
    double fval;
    int bval;
    char *sval;
    AstNode *node;
    AstTypeTag type_tag;
    AstList list;
}
```

Typed symbols use `<node>`, `<list>`, and `<type_tag>` for AST-carrying nonterminals. Tokens retain `<sval>` / `<ival>` / `<fval>` / `<bval>`.

### Destructors

```yacc
%destructor { free($$); } <sval>
%destructor { ast_free($$); } <node>
%destructor { ast_free($$.head); } <list>
```

Successful reductions do **not** run destructors on consumed RHS symbols. Destructors free values discarded during error recovery / stack unwind.

---

## AST Construction and Root Ownership

- Semantic actions call constructors from `src/ast/ast.h` (`ast_program`, `ast_block`, `ast_var_decl`, `ast_assign`, `ast_if`, `ast_while`, `ast_print_stmt`, expression constructors, …).
- Statement lists use `ast_list_empty` / `ast_list_append` (`AstList` head/tail).
- Successful `program` builds `AST_PROGRAM`, assigns **`compilecraft_ast_root`**, and sets start-symbol `$$ = NULL` so Bison never double-owns the live root.
- Driver / harness clears `compilecraft_ast_root` before `yyparse` and frees it exactly once afterward.

Test-only expression capture (`compilecraft_capture_expr_enable` / `compilecraft_expr_capture`) is used by `tests/expr_ast/` and remains disabled (`0`) in the production CLI. Program-capture hooks have been **retired**.

---

## Optional `--ast` CLI (M4.3.2)

```text
compilecraft-parser.exe <source-file>
compilecraft-parser.exe --ast <source-file>
compilecraft-parser.exe <source-file> --ast
```

| Mode | Clean success | Errors |
|---|---|---|
| Default | `Syntax validation successful.` | Diagnostics on stderr; exit `1`; free any root |
| `--ast` | `ast_print` of `compilecraft_ast_root` only (no success banner) | Diagnostics; exit `1`; **no** AST dump |

Clean success requires `yyparse() == 0` **and** zero lexical/syntax error counts. Unknown flags, missing paths, and multiple source files print usage to stderr and exit `1`.

Production golden suite: `tests/ast/` via `mingw32-make test-ast` (`run_tests.py` passes `--ast` for that directory).

---

## Memory Ownership

| Path | Ownership |
|---|---|
| Lexer `IDENTIFIER` | `yylval.sval = strdup(yytext)` in `src/lexer/lexer.l` |
| Successful identifier adoption | Transferred into `ast_identifier` (or freed by the reducing action that consumes it) |
| Discarded `<sval>` | `%destructor { free($$); } <sval>` |
| Discarded `<node>` / `<list>` | `%destructor` → `ast_free` |
| Production AST root | `compilecraft_ast_root`; driver frees once after parse |
| EOF / `yylex_destroy` | Scanner teardown after parse |

AddressSanitizer is **not** available in the verified MSYS2 UCRT64 toolchain (`-lasan` missing). Ownership is reviewed statically and covered by regression / unit tests; runtime leak-freedom via ASAN is **not** claimed.

---

## Language Coverage (baseline `.mc`)

The grammar covers the Section 5 mini-language: typed variable declarations (optional initializer), assignments, expression statements, empty statements, blocks, `if` / `if-else`, `while`, `print`, and the full expression hierarchy with Bison precedence / associativity. See `docs/grammar.md` for the formal CFG.

There is **no** assignment-*expression* form; assignment is statement-only (`AST_ASSIGN`).
