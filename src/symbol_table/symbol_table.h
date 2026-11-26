#ifndef COMPILECRAFT_SYMBOL_TABLE_H
#define COMPILECRAFT_SYMBOL_TABLE_H

/* ==============================================================================
 * CompileCraft - Scoped Symbol Table (Milestone 5)
 * Tracks variable declarations, data types, scope levels, and source lines.
 * ============================================================================== */

#include <stdio.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum DataType {
    TYPE_UNKNOWN = 0,
    TYPE_INT,
    TYPE_FLOAT,
    TYPE_BOOL,
    TYPE_STRING
} DataType;

const char *datatype_to_string(DataType type);

typedef struct Symbol {
    char *name;                 /* Owned identifier string */
    DataType type;              /* Variable data type */
    int scope_level;            /* 0 for global scope, 1 for block depth 1, etc. */
    int line;                   /* Declaration source line number */
    struct Symbol *next;        /* Collision chain in bucket */
} Symbol;

typedef struct ScopeFrame {
    int level;                  /* Scope depth (0 = global) */
    int symbol_count;           /* Number of symbols declared in this frame */
    Symbol **buckets;           /* Hash table buckets */
    size_t num_buckets;         /* Bucket count (e.g. 32) */
    struct ScopeFrame *parent;  /* Enclosing ancestor scope frame */
} ScopeFrame;

/* Historical record of symbols from exited scopes (for Rule 3 scope violation detection) */
typedef struct ExitedSymbolRecord {
    char *name;
    DataType type;
    int scope_level;
    int line;
    struct ExitedSymbolRecord *next;
} ExitedSymbolRecord;

typedef struct SymbolTable {
    ScopeFrame *current_scope;
    ExitedSymbolRecord *exited_symbols;
} SymbolTable;

/* Lifecycle Operations */
SymbolTable *symbol_table_create(void);
void symbol_table_destroy(SymbolTable *st);

/* Scope Management */
void symbol_table_enter_scope(SymbolTable *st);
int symbol_table_exit_scope(SymbolTable *st);
int symbol_table_get_scope_level(const SymbolTable *st);

/* Symbol Operations */
Symbol *symbol_table_insert(SymbolTable *st, const char *name, DataType type, int line);
Symbol *symbol_table_lookup_current_scope(const SymbolTable *st, const char *name);
Symbol *symbol_table_lookup_all_scopes(const SymbolTable *st, const char *name);

/* Scope Violation Diagnostic Helper */
bool symbol_table_was_declared_in_exited_scope(const SymbolTable *st, const char *name, int *out_line);

/* Deterministic dump of active and exited symbols for compiler --symtab mode */
void symbol_table_print(const SymbolTable *st, FILE *out);

/* Convenience Aliases */
static inline void enter_scope(SymbolTable *st) {
    symbol_table_enter_scope(st);
}

static inline int exit_scope(SymbolTable *st) {
    return symbol_table_exit_scope(st);
}

static inline Symbol *lookup_current_scope(const SymbolTable *st, const char *name) {
    return symbol_table_lookup_current_scope(st, name);
}

static inline Symbol *lookup_all_scopes(const SymbolTable *st, const char *name) {
    return symbol_table_lookup_all_scopes(st, name);
}

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_SYMBOL_TABLE_H */
