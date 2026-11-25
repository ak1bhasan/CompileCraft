# CompileCraft Abstract Syntax Tree (AST) Design

> **Milestone**: 4 — AST Development (complete through M4.5)
>
> **Status**: Implemented and documented; design authority for baseline `.mc` AST
>
> **Scope**: Baseline mini-language (`.mc`) only
>
> **Code location**: `src/ast/` (`ast.h`, `ast.c`)

This document is the authoritative AST architecture for Milestone 4. Design decisions below match the implemented API in `src/ast/` and the parser wiring in `src/parser/`.

---

## 1. Goals and Non-Goals

### Goals
- Capture the semantic structure of a successfully parsed program.
- Strip syntactic noise (`(…)`, `;` as punctuation, `{` / `}` as tokens).
- Support indented pretty-printing for debugging and regression tests.
- Preserve strict heap ownership with cleanup on error recovery.
- Remain a clean input to M5 (symbol table), M6 (semantics), and M7 (TAC).

### Non-Goals (M4)
- Symbol tables, type checking, or TAC.
- C / C++ / Java parsers or language-specific AST variants.
- Unified `compilecraft` driver (M8).
- Assignment *expressions* (statement assignment only).
- Changing default parser CLI success/error text (except optional `--ast`).

---

## 2. Agreed Design Decisions

| # | Decision |
|---|---|
| 1 | Implement AST under **`src/ast/`** (not `src/common/ast/` yet). |
| 2 | Include **`AST_EMPTY_STMT`** for bare `;` statements. |
| 3 | Keep **`AST_EXPR_STMT`** for expression statements. |
| 4 | Assignment targets are **`AST_IDENTIFIER`** child nodes (not bare `char *`). |
| 5 | Statement collections are **linked lists** with **head/tail helpers** for O(1) append. |
| 6 | Source lines come from **Bison locations** (`@n` / `YYLTYPE`), not ad-hoc `yylineno` snapshots alone. |
| 7 | **`--ast`** is optional; default parser output stays unchanged. |
| 8 | AST regression lives in **`tests/ast/`** (separate from `tests/parser/`). |
| 9 | **No assignment expressions** in the grammar or AST. |
| 10 | **Strict ownership**; partial trees freed during error recovery via `%destructor`. |

Roadmap path `src/ast/` matches this freeze. Shared `src/common/ast/` remains a later multi-language concern (DEC-13), not an M4 requirement.

---

## 3. YYSTYPE Compatibility (Critical)

### 3.1 Current arrangement

| Build | Who defines `YYSTYPE`? | Who defines `yylval`? |
|---|---|---|
| Standalone lexer | Fallback union in `src/lexer/tokens.h` (guarded) | `src/lexer/tokens.c` |
| Parser binary | Bison `%union` in `src/parser/parser.y` → `parser.tab.h` | `parser.tab.c` (`-DBISON_OWNS_YYLVAL` on `tokens.c`) |

`tokens.h` only declares its fallback `YYSTYPE` when none of `YYSTYPE`, `YYSTYPE_DEFINED`, or `YYSTYPE_IS_DECLARED` is set. Parser sources include **`parser.tab.h` before `tokens.h`**, so Bison owns the type.

Token **IDs** remain locked to `src/lexer/tokens.def` via existing `_Static_assert` in `src/parser/main.c`. M4 must not renumber tokens.

Current fallback / `%union` payload fields used by the baseline lexer:

```c
int ival;
double fval;
int bval;
char *sval;
```

### 3.2 `%union` rules (implemented)

1. **Authoritative parser `YYSTYPE`** is the Bison `%union` in `parser.y`.
2. Existing members **`ival`**, **`fval`**, **`bval`**, **`sval`** keep the same names and roles so Flex actions in `src/lexer/lexer.l` stay valid.
3. Parser-only AST members (implemented):
   - `AstNode *node;`
   - `AstTypeTag type_tag;`
   - `AstList list;`
4. The standalone-lexer fallback in `tokens.h` is **not** enlarged; only the parser-linked build sees AST fields.
5. **Parser-linked `lex.yy.o`**: compiled with `-include parser.tab.h`, `-Isrc/ast`, and `-I$(BUILD_PARSER_DIR)` so one `YYSTYPE` layout is used end-to-end. Standalone `compilecraft-lexer.exe` continues to use the `tokens.h` fallback unchanged.
6. `ast.h` never defines a competing `typedef union YYSTYPE`.

---

## 4. Node Kinds

```c
typedef enum AstKind {
    AST_PROGRAM,
    AST_BLOCK,
    AST_VAR_DECL,
    AST_ASSIGN,
    AST_EXPR_STMT,
    AST_EMPTY_STMT,
    AST_IF,
    AST_WHILE,
    AST_PRINT,
    AST_BINARY_OP,
    AST_UNARY_OP,
    AST_IDENTIFIER,
    AST_LITERAL
} AstKind;
```

| Kind | Meaning |
|---|---|
| `AST_PROGRAM` | Compilation unit; statement list |
| `AST_BLOCK` | `{ … }`; statement list (future scope boundary) |
| `AST_VAR_DECL` | Typed declaration; optional initializer expression |
| `AST_ASSIGN` | Statement assignment; target is `AST_IDENTIFIER` |
| `AST_EXPR_STMT` | Expression used as a statement |
| `AST_EMPTY_STMT` | Bare `;` |
| `AST_IF` | `if` with optional `else` |
| `AST_WHILE` | `while` loop |
| `AST_PRINT` | `print` statement |
| `AST_BINARY_OP` | Binary operator application |
| `AST_UNARY_OP` | Unary `!` or arithmetic negation |
| `AST_IDENTIFIER` | Name occurrence (decl name, assign target, or use) |
| `AST_LITERAL` | Int, float, or bool constant |

**Not represented as nodes:** parentheses groupings, braces/semicolon tokens, error-recovery placeholders.

---

## 5. Supporting Enumerations

```c
typedef enum AstTypeTag {
    AST_TYPE_INT,
    AST_TYPE_FLOAT,
    AST_TYPE_BOOL
} AstTypeTag;

typedef enum AstBinOp {
    AST_OP_ADD, AST_OP_SUB, AST_OP_MUL, AST_OP_DIV, AST_OP_MOD,
    AST_OP_EQ, AST_OP_NE, AST_OP_LT, AST_OP_GT, AST_OP_LE, AST_OP_GE,
    AST_OP_AND, AST_OP_OR
} AstBinOp;

typedef enum AstUnOp {
    AST_OP_NOT,
    AST_OP_NEG
} AstUnOp;

typedef enum AstLitKind {
    AST_LIT_INT,
    AST_LIT_FLOAT,
    AST_LIT_BOOL
} AstLitKind;
```

No expression-level assignment operator is defined.

---

## 6. Node Structure and Parent–Child Relationships

```c
typedef struct AstNode AstNode;

struct AstNode {
    AstKind kind;
    int line;       /* first line of the construct (from Bison location) */
    int column;     /* optional; 0 if unused */
    AstNode *next;  /* next statement in a list; NULL if not a list element */
    /* Internal membership: set when owned by any AstList / statement chain.
     * Rejects cross-list append of tails/sole members (next may be NULL). */
    unsigned char in_stmt_list;

    union {
        struct {
            AstNode *stmts;   /* head of statement list */
            AstNode *stmts_tail;
        } program;

        struct {
            AstNode *stmts;
            AstNode *stmts_tail;
        } block;

        struct {
            AstTypeTag type_tag;
            AstNode *name;    /* AST_IDENTIFIER */
            AstNode *init;    /* expression or NULL */
        } var_decl;

        struct {
            AstNode *target;  /* AST_IDENTIFIER */
            AstNode *value;   /* expression */
        } assign;

        struct {
            AstNode *expr;
        } expr_stmt;

        /* AST_EMPTY_STMT: no payload */

        struct {
            AstNode *cond;
            AstNode *then_branch;
            AstNode *else_branch; /* NULL if no else */
        } if_stmt;

        struct {
            AstNode *cond;
            AstNode *body;
        } while_stmt;

        struct {
            AstNode *expr;
        } print_stmt;

        struct {
            AstBinOp op;
            AstNode *left;
            AstNode *right;
        } binary;

        struct {
            AstUnOp op;
            AstNode *operand;
        } unary;

        struct {
            char *name;       /* owned heap string */
        } identifier;

        struct {
            AstLitKind lit_kind;
            union {
                int ival;
                double fval;
                int bval;
            } as;
        } literal;
    } u;
};
```

### Parent–child rules
- Children are exclusive pointers owned by the parent node.
- Statement sequences use **`next`** sibling links; containers hold **`stmts` (head)** and **`stmts_tail`** for O(1) append.
- `in_stmt_list` marks exclusive list ownership so a node cannot sit in two `AstList`s (including when it is a tail or sole member with `next == NULL`).
- No parent back-pointers in M4 (keeps construction simple).
- Expressions form trees via `left` / `right` / `operand` / `expr` / `cond` / etc.
- `AST_ASSIGN.target` and `AST_VAR_DECL.name` are **`AST_IDENTIFIER`** nodes.

### Identifier and literal storage
- **Identifiers:** `u.identifier.name` is a heap string. Ownership transfers from lexer `sval` into the identifier node (or `strdup` once if a copy is required). After transfer, the parser must not `free` that `sval` separately.
- **Literals:** numeric/bool values copied into `u.literal.as`; no heap payload.
- **Declaration type:** `AstTypeTag` on `AST_VAR_DECL` only (not a general expression type system).

---

## 7. Statement List Helpers

```c
typedef struct AstList {
    AstNode *head;
    AstNode *tail;
} AstList;

AstList ast_list_empty(void);
int ast_list_append(AstList *list, AstNode *stmt); /* O(1); see ownership below */
AstNode *ast_list_head(AstList list);
```

Ownership rules for `ast_list_append` (matches `src/ast/ast.h` / `ast.c`):

| Result | List metadata | Node ownership |
|---|---|---|
| Success (`1`) | `stmt` linked at tail; `in_stmt_list` set | Ownership transfers to the **destination** list exactly once |
| Failure (`0`), `stmt->in_stmt_list != 0` | `*list` unchanged (no head/tail/`next` writes); `ast_list_append` does **not** free `stmt` | An **existing** list already owns `stmt`; the caller must **not** free it |
| Failure (`0`), other reasons | `*list` unchanged; `ast_list_append` does **not** free `stmt` | Caller still owns `stmt` and must free it (or retry with a valid list) |

Other rejection reasons: `list`/`stmt` is NULL, or `stmt->next != NULL` (chained without membership). The `in_stmt_list != 0` case covers middle nodes, tails, and sole members already owned by this or another list. The public list API cannot create cycles: rejected nodes are never linked.

Usage in Bison (conceptual):

- `%empty` statement_list → empty list.
- `statement_list statement` → copy `$1` into `$$`, then `ast_list_append(&$$, $2)`. On failure, free `$2` **only if** `!$2->in_stmt_list` (otherwise another list still owns it).
- `AST_PROGRAM` / `AST_BLOCK` store head and tail from the finished list.

Empty programs and empty blocks are valid (null head/tail).

---

## 8. Constructor Interfaces (implemented)

Constructors allocate with `calloc`, set `kind` / location, take ownership of child pointers and identifier strings as documented in `src/ast/ast.h`.

```c
AstNode *ast_program(AstList stmts, int line, int column);
AstNode *ast_block(AstList stmts, int line, int column);
AstNode *ast_var_decl(AstTypeTag type_tag, AstNode *name, AstNode *init,
                      int line, int column);
AstNode *ast_assign(AstNode *target, AstNode *value, int line, int column);
AstNode *ast_expr_stmt(AstNode *expr, int line, int column);
AstNode *ast_empty_stmt(int line, int column);
AstNode *ast_if(AstNode *cond, AstNode *then_branch, AstNode *else_branch,
                int line, int column);
AstNode *ast_while(AstNode *cond, AstNode *body, int line, int column);
/* Print-statement constructor — named ast_print_stmt to avoid clashing
 * with the pretty-printer ast_print. */
AstNode *ast_print_stmt(AstNode *expr, int line, int column);
AstNode *ast_binary(AstBinOp op, AstNode *left, AstNode *right,
                    int line, int column);
AstNode *ast_unary(AstUnOp op, AstNode *operand, int line, int column);
AstNode *ast_identifier(char *name, int line, int column); /* takes name ownership */
AstNode *ast_literal_int(int value, int line, int column);
AstNode *ast_literal_float(double value, int line, int column);
AstNode *ast_literal_bool(int value, int line, int column);

void ast_free(AstNode *node);           /* recursive; walks next lists */
void ast_print(const AstNode *node, FILE *out); /* pretty-printer */
void ast_print_indent(const AstNode *node, FILE *out, int depth);
```

Allocation failure policy: return `NULL` and let the driver treat it as a fatal internal error (non-zero exit); do not partially leave owned children unattached without freeing them in the failing constructor.

---

## 9. Traversal and Pretty-Printing

- Default traversal is recursive by `kind`, then along `next` for statement lists.
- `ast_print` emits deterministic indented text suitable for `tests/ast/*.expected`.
- Suggested shape:

```text
Program
  VarDecl int
    Identifier x
  Assign
    Identifier y
    Binary +
      Identifier y
      Identifier x
  EmptyStmt
  While
    Binary >
      Identifier x
      Literal int 0
    Block
      ...
```

Printer must not emit parentheses, braces, or semicolons as structural nodes (except describing `EmptyStmt`).

---

## 10. Memory Allocation and Cleanup

| Object | Owner |
|---|---|
| `AstNode` | Parent node, list container, or `compilecraft_ast_root` |
| Identifier `name` string | The `AST_IDENTIFIER` node |
| Lexer `sval` not adopted | Freed by the reducing action or `%destructor { free($$); } <sval>` |
| Partial AST on parse error | `%destructor { ast_free($$); } <node>` and `%destructor { ast_free($$.head); } <list>` |
| Successful parse | Driver/`harness` calls `ast_free(compilecraft_ast_root)` exactly once after optional print |

`ast_free`:
1. Recursively free children for the active `kind`.
2. Free `identifier.name` when present.
3. Free the `next` chain only from list heads (containers free the chain once; `in_stmt_list` prevents a node from belonging to two lists).

Invariant: every heap node has exactly one owner pointer. `ast_free` remains compatible with list membership: it walks `next` from a head, frees each node once, and does not require clearing `in_stmt_list` first.

### Production root lifecycle (`compilecraft_ast_root`)

Declared in `src/parser/parser.h` / defined in `parser.y`:

1. Driver clears `compilecraft_ast_root = NULL` before `yyparse()`.
2. Successful `program` reduction builds `AST_PROGRAM`, assigns `compilecraft_ast_root = prog`, and sets start-symbol `$$ = NULL` so Bison never owns the live root.
3. After `yyparse`, the driver (or program AST harness) is the sole owner and must `ast_free` exactly once, then set the pointer back to `NULL`.
4. Clean success for CLI/`--ast` also requires `yyparse() == 0` and zero `syntax_error_count` / `lexical_error_count`.

Retired: `compilecraft_program_capture*` hooks no longer exist. Expression capture (`compilecraft_capture_expr_enable` / `compilecraft_expr_capture`) remains **test-only** for `tests/expr_ast/`.

---

## 11. Source Locations

### Implemented
- Bison **`%locations`** is enabled in `parser.y`.
- Constructors receive `@$` / `@n` first line/column for the reduced construct (binary ops use `@$`; unary uses the operator `@1`; literals/identifiers use their token `@1`).
- Default `YYLTYPE` (`first_line`, `first_column`, `last_line`, `last_column`) is used.
- Parser-linked Flex updates `yylloc` via `YY_USER_ACTION` in `lexer.l`. `compilecraft_loc_reset()` resets the location cursor before each parse.

### Stored on nodes
- `line` = `first_line`
- `column` = `first_column` (stored; current pretty-printer does not print columns)

Do not rely on bare `yylineno` at reduce time for node locations; it can disagree with token spans after error recovery.

---

## 12. Bison Integration Strategy

### 12.1 `%union` (implemented)

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

`AstList` is a small POD (two pointers) included via `ast.h` through `%code requires`. Head/tail helpers remain the only list mutation API.

### 12.2 `%type` assignments
- `<node>`: `program`, `statement`, `var_decl_stmt`, `assign_stmt`, `if_stmt`, `while_stmt`, `print_stmt`, `block_stmt`, `expr_stmt`, `expression`, …
- `<list>`: `statement_list`
- `<type_tag>`: `type_spec`
- Tokens keep existing `<sval>` / `<ival>` / `<fval>` / `<bval>`

### 12.3 Representative actions

```yacc
statement_list
    : %empty                         { $$ = ast_list_empty(); }
    | statement_list statement
      {
        $$ = $1;
        if ($2 != NULL) {
          /*
           * Success: destination list owns $2.
           * Failure with in_stmt_list: another list already owns $2 — do not free.
           * Failure otherwise: parser action still owns $2 — free it.
           */
          if (!ast_list_append(&$$, $2)) {
            if (!$2->in_stmt_list) {
              ast_free($2);
            }
          }
        }
      }
    ;

statement
    : SEMICOLON                      { $$ = ast_empty_stmt(@1.first_line, @1.first_column); }
    | expr_stmt
    | /* other stmts */
    ;

assign_stmt
    : IDENTIFIER ASSIGN expression SEMICOLON
      {
        AstNode *id = ast_identifier($1, @1.first_line, @1.first_column);
        $$ = ast_assign(id, $3, @$.first_line, @$.first_column);
      }
    ;

expression
    : LPAREN expression RPAREN       { $$ = $2; }
    | expression PLUS expression
      { $$ = ast_binary(AST_OP_ADD, $1, $3, @$.first_line, @$.first_column); }
    ;
```

### 12.4 Root handle
- Global `AstNode *compilecraft_ast_root` (declared in `parser.h`, defined in `parser.y`).
- Set only from the successful `program` reduction; start-symbol `$$` remains `NULL`.
- Clear to `NULL` before each parse; free exactly once afterward.

### 12.5 Error recovery and ownership
- All M3.3 recovery productions remain.
- Recovery actions do **not** fabricate semantic AST for invalid phrases (yield `NULL` / free partial children).
- Any `AstNode *` / list values discarded by the error mechanism are released through `%destructor`.
- If `syntax_error_count > 0` or `lexical_error_count > 0` or `yyparse() != 0`, the driver does not treat the tree as authoritative; it frees any root and skips the `--ast` success path.

### 12.6 Destructors (implemented)

```yacc
%destructor { free($$); } <sval>
%destructor { ast_free($$); } <node>
%destructor { ast_free($$.head); } <list>
```

---

## 13. Driver and CLI

| Mode | Behavior |
|---|---|
| Default (no flag) | Unchanged: success → `Syntax validation successful.\n`; errors → existing diagnostics; exit codes unchanged |
| `--ast` | On clean success only: print AST via `ast_print` to stdout (no success banner); then free tree |
| Failure | No false success; free partial state; exit `1`; no AST dump |

Flag may appear before or after the source path. Unknown flags, missing paths, and multiple source files print usage to stderr and exit `1`.

Existing `tests/parser/` cases remain default-mode syntax tests.

---

## 14. Testing Strategy

| Suite | Role | Make target |
|---|---|---|
| `tests/parser/` | Syntax validation (no `--ast`) | `test-parser` |
| `tests/expr_ast/` | Expression structure via capture harness | `test-expr-ast` |
| `tests/program_ast/` | Statement/program structure via harness + `compilecraft_ast_root` | `test-program-ast` |
| `tests/ast/` | Production goldens: `compilecraft-parser.exe --ast` | `test-ast` |
| `tests/ast_ownership/` | List membership / cross-append unit test | `test-ast-ownership` |

`tests/ast/` (M4.4) covers declarations (with/without init), assignment, empty and expression statements, binary/unary ops, precedence, if/else, while, nested blocks, a mixed program, and at least one `error_*` case that exits `1` without writing a successful AST.

Lexer suites remain untouched. Full `mingw32-make test` runs **190** golden cases plus the ownership unit test.

---

## 15. Future Compatibility

| Milestone | How this AST helps |
|---|---|
| **M5 Symbol table** | Enter/exit scope on `AST_PROGRAM` / `AST_BLOCK`; insert on `AST_VAR_DECL`; resolve `AST_IDENTIFIER` uses and assign targets; use `line`/`column` in diagnostics |
| **M6 Semantic analysis** | Same walk; may later add optional annotation fields (`expr_type`, `symbol`) without changing node kinds |
| **M7 TAC** | Lower binary/unary/if/while/print/assign from the same tree |

M4 does not require those annotation fields.

---

## 16. Implementation Sub-Milestones

| Sub | Deliverable | Status |
|---|---|---|
| **M4.0** | This document (`docs/ast.md`) | **Done** |
| **M4.1** | `src/ast/ast.h`, `src/ast/ast.c` (constructors, lists, `ast_free`, `ast_print`) | **Done** |
| **M4.2** | `%locations`, `%union`/`%type`/actions/destructors; lexer `yylloc`; YYSTYPE include-order fix for parser lex.o | **Done** |
| **M4.2.5** | Expression AST nodes; parentheses transparent | **Done** (`tests/expr_ast/` — 30) |
| **M4.2.6** | Statement / program AST construction | **Done** (`tests/program_ast/` — 25) |
| **M4.2.7** | List ownership safeguards | **Done** (`tests/ast_ownership/`) |
| **M4.3.1** | `compilecraft_ast_root` handoff | **Done** |
| **M4.3.2** | Production `--ast` CLI | **Done** |
| **M4.4** | `tests/ast/` + `test-ast` | **Done** (14 goldens) |
| **M4.5** | README / roadmap / parser / AST docs sync | **Done** |

### Expression construction notes (M4.2.5)

- Binary location uses `@$` (start of the reduced expression); unary uses the operator token `@1`; literals/identifiers use their token `@1`.
- Constructor failure frees transferred arguments; actions must not `free`/`ast_free` children again after a successful call.
- Structural checks use `bin/compilecraft-expr-ast.exe` with `compilecraft_capture_expr_enable` (test-only; production CLI leaves enable at `0`).
- When expression capture is enabled, `expr_stmt` transfers the raw expression and yields a NULL statement (no shared ownership with `AST_EXPR_STMT`).

### Statement / program construction notes (M4.2.6 / M4.3.1)

- Statement locations use `@$` (start of the reduced construct); bare `;` uses `@1`.
- `statement_list` uses `ast_list_append`; NULL recovery placeholders are skipped; append failure frees the rejected node.
- Successful `program` builds `AST_PROGRAM`, assigns `compilecraft_ast_root`, and leaves start-symbol `$$` as `NULL`. The driver or harness frees the root once.
- Recovery productions (`error` arms) free partial children/lists and yield NULL — no fabricated statement/program nodes.

---

## 17. Out of Scope Reminder

- No symbol table or semantic analyzer in M4 (those are M5 / M6).
- No C / C++ / Java parsers or language-specific ASTs in M4.
- No AI co-author trailers on commits.

---

## 18. Consistency Review (Design vs Repo)

| Source | Alignment |
|---|---|
| `parser.y` grammar | Node kinds map 1:1 to statements/expressions; recovery kept; no assign-expr production |
| `parser.md` | Documents M3.3 recovery plus M4 AST wiring / `--ast` |
| Roadmap M4 | Acceptance criteria satisfied; next milestone is M5 |
| Token IDs / `_Static_assert` | Preserved; `%union` additive only |
| DEC-13 shared AST path | Deferred; baseline `src/ast/` is intentional for M4 |

**Milestone 4 is complete through M4.5.** Next development milestone: **M5 Scoped Symbol Table**.
