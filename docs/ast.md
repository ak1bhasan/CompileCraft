# CompileCraft Abstract Syntax Tree (AST) Design

> **Milestone**: 4 — AST Development (design freeze)
>
> **Status**: Approved architecture; implementation not started
>
> **Scope**: Baseline mini-language (`.mc`) only
>
> **Code location**: `src/ast/` (`ast.h`, `ast.c` — to be added in M4.1+)

This document is the authoritative AST architecture for Milestone 4. It freezes design decisions before `ast.h` / `ast.c` and parser wiring are implemented.

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

### 3.2 Rules for extending `%union` in M4

1. **Authoritative parser `YYSTYPE`** remains the Bison `%union` in `parser.y`.
2. Keep existing members **`ival`**, **`fval`**, **`bval`**, **`sval`** with the same names and roles so the Flex actions in `src/lexer/lexer.l` stay valid.
3. Add parser-only members for AST wiring, for example:
   - `struct AstNode *node;`
   - `AstTypeTag type_tag;` (declaration types)
   - optional list cursor types if needed (prefer carrying lists as `AstNode *` heads)
4. **Do not** enlarge or diverge the standalone-lexer fallback in `tokens.h` unless the lexer object linked into the parser is rebuilt against `parser.tab.h`.
5. **Parser-linked `lex.yy.o`**: when AST fields are added to `%union`, compile the parser’s lexer object with include order `parser.tab.h` then `tokens.h` (and `-I$(BUILD_PARSER_DIR)`), so one layout is used end-to-end. Standalone `compilecraft-lexer.exe` continues to use the tokens.h fallback unchanged.
6. Never define a second competing `typedef union YYSTYPE` in `ast.h`.

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

Ownership rules for `ast_list_append`:

| Result | List metadata | Node ownership |
|---|---|---|
| Success (`1`) | `stmt` linked at tail; `in_stmt_list` set | Ownership transfers to the list exactly once |
| Failure (`0`) | `*list` unchanged (no head/tail/`next` writes) | Caller retains ownership; node is **not** freed |

Rejection reasons: `list`/`stmt` is NULL; `stmt->next != NULL`; or `stmt->in_stmt_list != 0` (already owned by this or another list — covers middle nodes, tails, and sole members). The public list API cannot create cycles.

Usage in Bison (conceptual):

- `%empty` statement_list → empty list.
- `statement_list statement` → copy `$1` into `$$`, then `ast_list_append(&$$, $2)`; on failure free `$2` (or equivalent) and recover.
- `AST_PROGRAM` / `AST_BLOCK` store head and tail from the finished list.

Empty programs and empty blocks are valid (null head/tail).

---

## 8. Constructor Interfaces (M4.1)

Constructors allocate with `calloc`, set `kind` / location, take ownership of child pointers and identifier strings as documented per function.

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
| `AstNode` | Parent node, list container, or `ast_root` |
| Identifier `name` string | The `AST_IDENTIFIER` node |
| Lexer `sval` not adopted | Freed by the reducing action or `%destructor { free($$); } <sval>` |
| Partial AST on parse error | `%destructor { ast_free($$); } <node>` (and list-carrying typed symbols) |
| Successful parse | Driver calls `ast_free(ast_root)` after optional print |

`ast_free`:
1. Recursively free children for the active `kind`.
2. Free `identifier.name` when present.
3. Free the `next` chain only from list heads (containers free the chain once; `in_stmt_list` prevents a node from belonging to two lists).

Invariant: every heap node has exactly one owner pointer. `ast_free` remains compatible with list membership: it walks `next` from a head, frees each node once, and does not require clearing `in_stmt_list` first.

---

## 11. Source Locations

### Plan
- Enable Bison **`%locations`** in `parser.y` during M4.2.
- Use `@$`, `@1`, … when calling constructors (`@$` first line/column for the reduced construct).
- Default `YYLTYPE` (`first_line`, `first_column`, `last_line`, `last_column`) is sufficient.
- Flex must update `yylloc` (typically `YY_USER_ACTION` in `lexer.l`) so locations track tokens. That lexer update is part of **M4.2 wiring**, not M4.1.

### Stored on nodes
- `line` = `first_line`
- `column` = `first_column` (may be printed later; M4 tests may ignore column)

Do not rely on bare `yylineno` at reduce time for node locations once `%locations` is active; it can disagree with token spans after error recovery.

---

## 12. Bison Integration Strategy

### 12.1 `%union` sketch (implementation phase)

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

Notes:
- `AstList` is a small POD (two pointers); acceptable in `%union` if included via a header visible to Bison.
- If putting `AstList` in the union is awkward for Bison/C interop, carry only `AstNode *` head and maintain tail in dedicated mid-rule helpers—or store tail in `program`/`block` only after the list is complete. Prefer a documented single approach in M4.1/M4.2; **head/tail helpers remain mandatory**.

### 12.2 `%type` assignments
- `<node>`: `program`, `statement`, `var_decl_stmt`, `assign_stmt`, `if_stmt`, `while_stmt`, `print_stmt`, `block_stmt`, `expr_stmt`, `expression`, …
- `<list>`: `statement_list` (if using `AstList`)
- `<type_tag>`: `type_spec`
- Tokens keep existing `<sval>` / `<ival>` / `<fval>` / `<bval>`

### 12.3 Representative actions

```yacc
statement_list
    : %empty                         { $$ = ast_list_empty(); }
    | statement_list statement
      {
        $$ = $1;
        if (!ast_list_append(&$$, $2)) {
          ast_free($2); /* append rejected; caller still owned $2 */
          YYERROR;      /* or other recovery — sketch only */
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
- Global `AstNode *ast_root` (declared in parser/driver).
- Set only from the successful `program` reduction.
- Clear to `NULL` before each parse.

### 12.5 Error recovery and ownership
- Keep all M3.3 recovery productions.
- Recovery actions must **not** fabricate semantic AST for invalid phrases.
- Any `AstNode *` / list values discarded by the error mechanism are released through `%destructor`.
- If `syntax_error_count > 0` or `lexical_error_count > 0` or `yyparse() != 0`, the driver must not treat the tree as authoritative; free any root and skip success/`--ast` success path.

### 12.6 Destructors

```yacc
%destructor { free($$); } <sval>
%destructor { ast_free($$); } <node>
%destructor {
    ast_free($$.head); /* frees entire next-chain */
} <list>
```

(Exact `<list>` destructor syntax follows the chosen `AstList` representation.)

---

## 13. Driver and CLI

| Mode | Behavior |
|---|---|
| Default (no flag) | Unchanged: success → `Syntax validation successful.\n`; errors → existing diagnostics; exit codes unchanged |
| `--ast` | On clean success only: print AST via `ast_print` to stdout (exact banner/format fixed in M4.3/M4.4); then free tree |
| Failure | No false success; free partial state; exit `1` |

Existing `tests/parser/` cases remain default-mode syntax tests.

---

## 14. Testing Strategy

| Suite | Role |
|---|---|
| `tests/parser/` | Unchanged syntax validation (no `--ast`) |
| `tests/ast/` | New; invoke parser with `--ast`; compare pretty-print to `.expected` |

Cover at least: declarations (with/without init), assignment, empty statements, expression statements, binary/unary ops, precedence, if/else, while, nested blocks, sample program, and at least one failure case that still exits `1` without writing a success tree.

Lexer suites remain untouched.

---

## 15. Future Compatibility

| Milestone | How this AST helps |
|---|---|
| **M5 Symbol table** | Enter/exit scope on `AST_PROGRAM` / `AST_BLOCK`; insert on `AST_VAR_DECL`; resolve `AST_IDENTIFIER` uses and assign targets; use `line`/`column` in diagnostics |
| **M6 Semantic analysis** | Same walk; may later add optional annotation fields (`expr_type`, `symbol`) without changing node kinds |
| **M7 TAC** | Lower binary/unary/if/while/print/assign from the same tree |

M4 must not require those annotation fields to exist yet.

---

## 16. Implementation Sub-Milestones

| Sub | Deliverable | Gate |
|---|---|---|
| **M4.0** | This document (`docs/ast.md`) | Design approved |
| **M4.1** | `src/ast/ast.h`, `src/ast/ast.c` (constructors, lists, `ast_free`, `ast_print`) | Compiles; no parser wiring yet (or minimal smoke only) |
| **M4.2** | `%locations`, `%union`/`%type`/actions/destructors; lexer `yylloc`; YYSTYPE include-order fix for parser lex.o | Trees for valid programs; **all existing tests still pass** |
| **M4.2.5** | Expression actions build real `AST_LITERAL` / `AST_IDENTIFIER` / `AST_BINARY_OP` / `AST_UNARY_OP` nodes; parentheses remain transparent | `tests/expr_ast/` structural suite via capture harness |
| **M4.2.6** | Statement / program AST construction | Deferred |
| **M4.3** | Driver `--ast`; root lifecycle | Default CLI unchanged |
| **M4.4** | `tests/ast/` + make target | Golden pretty-prints |
| **M4.5** | Roadmap/README/parser notes sync | M4 complete; M5 next |

### Expression construction notes (M4.2.5)

- Binary location uses `@$` (start of the reduced expression); unary uses the operator token `@1`; literals/identifiers use their token `@1`.
- Constructor failure frees transferred arguments; actions must not `free`/`ast_free` children again after a successful call.
- Until M4.2.6, statement productions still free completed expression trees after reduce (placeholder statements).
- Structural checks use `bin/compilecraft-expr-ast.exe` with the narrow `compilecraft_capture_expr_enable` hook — not a permanent public `--ast` CLI (that remains M4.3).

---

## 17. Out of Scope Reminder

- No `ast.c` / `ast.h` until M4.1 is authorized.
- No `parser.y` / lexer edits until M4.2 is authorized.
- No symbol table or semantic analyzer in M4.
- No AI co-author trailers on commits.

---

## 18. Consistency Review (Design vs Repo)

| Source | Alignment |
|---|---|
| `parser.y` grammar | Node kinds map 1:1 to statements/expressions; recovery kept; no assign-expr production |
| `parser.md` | AST remains next phase; ownership model extends sval rules |
| Roadmap M4 | `src/ast/`; constructors; print; free; program root — plus approved extras `AST_EMPTY_STMT`, `AST_EXPR_STMT` |
| Token IDs / `_Static_assert` | Preserved; `%union` additive only |
| DEC-13 shared AST path | Deferred; baseline `src/ast/` is intentional for M4 |

**M4.0 design freeze is complete with this document.** Implementation waits for explicit approval to start M4.1.
