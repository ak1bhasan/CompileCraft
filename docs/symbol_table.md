# CompileCraft Scoped Symbol Table Design & Implementation

> **Milestone**: 5 — Scoped Symbol Table (M5)  
> **Status**: Completed & Verified  
> **Code Location**: `src/symbol_table/` (`symbol_table.h`, `symbol_table.c`)  
> **Tests**: `tests/symbol_table/test_symbol_table.c` (`bin/test-symbol-table.exe`)

---

## 1. Overview & Objective

The Scoped Symbol Table serves as the compiler's lexical environment dictionary. It tracks declared identifiers, their static data types, lexical block nesting depths, and source declaration line numbers. It enforces block-level variable scoping and enables semantic diagnostics such as undeclared usage, duplicate definitions, and scope violations.

---

## 2. Data Structures

The symbol table is structured hierarchically using a stack of `ScopeFrame` nodes, where each frame represents a block scope `{ ... }`:

```c
typedef enum DataType {
    TYPE_UNKNOWN = 0,
    TYPE_INT,
    TYPE_FLOAT,
    TYPE_BOOL
} DataType;

typedef struct Symbol {
    char *name;                 /* Owned identifier heap string */
    DataType type;              /* Variable type (int, float, bool) */
    int scope_level;            /* 0 for global, 1 for block level 1, etc. */
    int line;                   /* Declaration source line */
    struct Symbol *next;        /* Collision chain in bucket */
} Symbol;

typedef struct ScopeFrame {
    int level;                  /* Nesting depth (0 = global) */
    int symbol_count;           /* Count of symbols in this frame */
    Symbol **buckets;           /* Hash table buckets (32 buckets) */
    size_t num_buckets;         /* Bucket count */
    struct ScopeFrame *parent;  /* Pointer to enclosing outer scope */
} ScopeFrame;
```

---

## 3. Core Operations

### 3.1 Scope Lifecycle
- **`symbol_table_create()`**: Allocates the table and initializes the root global scope frame (level 0).
- **`enter_scope(st)`**: Pushes a new `ScopeFrame` with `level = parent->level + 1`.
- **`exit_scope(st)`**: Closes the current scope frame. Deallocates all local symbols in that frame and unlinks the frame, returning to the parent scope. Exiting the global scope (level 0) is forbidden.
- **`symbol_table_destroy(st)`**: Reclaims all active frames, symbols, and historical diagnostic records.

### 3.2 Symbol Insertion & Lookup
- **`symbol_table_insert(st, name, type, line)`**:
  - Checks if `name` already exists in `current_scope`.
  - If a symbol exists in the current scope frame, returns `NULL` (signaling a same-scope redeclaration violation).
  - Otherwise, allocates an independent `Symbol`, duplicates `name` on the heap, and inserts it into the current frame's hash bucket.
- **`lookup_current_scope(st, name)`**:
  - Scans only the innermost active `ScopeFrame`. Used to detect duplicate definitions in the same block.
- **`lookup_all_scopes(st, name)`**:
  - Traverses outwards from `current_scope` along the `parent` pointers to the global root.
  - Returns the first matching symbol. This naturally implements variable shadowing where inner declarations hide outer declarations.

---

## 4. Scope Isolation & Diagnostic Tracking

Per DEC-05, only `{ ... }` blocks introduce new lexical scopes. When a block terminates via `exit_scope()`, all local symbols are freed so they cannot be accessed by subsequent statements.

To distinguish between **Rule 1 (Undeclared variable)** and **Rule 3 (Scope violation)**:
- When a scope frame exits, symbol descriptors are archived in `st->exited_symbols`.
- If an identifier lookup in `lookup_all_scopes` fails:
  - If the identifier is recorded in `exited_symbols`, the compiler reports a **Rule 3 Scope Violation** with the declaration line.
  - If it was never declared anywhere, the compiler reports a **Rule 1 Undeclared Variable** error.

---

## 5. Verification

The unit test suite (`tests/symbol_table/test_symbol_table.c`) tests:
1. Table initialization and level tracking.
2. Global scope declarations and data type storage.
3. Duplicate detection in the same scope.
4. Nested scope entry, multi-level hierarchy, and variable shadowing.
5. Scope exit, local symbol teardown, and isolation enforcement.
6. Multiple sibling blocks at the same depth without collision.
7. Clean memory deallocation with zero leaks.
