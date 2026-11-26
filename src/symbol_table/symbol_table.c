/* ==============================================================================
 * CompileCraft - Scoped Symbol Table Implementation (Milestone 5)
 * ============================================================================== */

#include "symbol_table.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define DEFAULT_NUM_BUCKETS 32

static unsigned long hash_string(const char *str) {
    unsigned long hash = 5381;
    int c;
    while ((c = (unsigned char)*str++)) {
        hash = ((hash << 5) + hash) + c; /* hash * 33 + c */
    }
    return hash;
}

const char *datatype_to_string(DataType type) {
    switch (type) {
        case TYPE_INT:   return "int";
        case TYPE_FLOAT: return "float";
        case TYPE_BOOL:  return "bool";
        default:         return "unknown";
    }
}

static ScopeFrame *scope_frame_create(int level, ScopeFrame *parent) {
    ScopeFrame *frame = (ScopeFrame *)malloc(sizeof(ScopeFrame));
    if (!frame) return NULL;

    frame->level = level;
    frame->symbol_count = 0;
    frame->num_buckets = DEFAULT_NUM_BUCKETS;
    frame->parent = parent;

    frame->buckets = (Symbol **)calloc(frame->num_buckets, sizeof(Symbol *));
    if (!frame->buckets) {
        free(frame);
        return NULL;
    }

    return frame;
}

static void scope_frame_free_symbols(ScopeFrame *frame, ExitedSymbolRecord **exited_list) {
    if (!frame || !frame->buckets) return;

    for (size_t i = 0; i < frame->num_buckets; i++) {
        Symbol *sym = frame->buckets[i];
        while (sym) {
            Symbol *next = sym->next;

            /* Save into historical record if list pointer provided */
            if (exited_list) {
                ExitedSymbolRecord *rec = (ExitedSymbolRecord *)malloc(sizeof(ExitedSymbolRecord));
                if (rec) {
                    rec->name = strdup(sym->name ? sym->name : "");
                    rec->type = sym->type;
                    rec->scope_level = sym->scope_level;
                    rec->line = sym->line;
                    rec->next = *exited_list;
                    *exited_list = rec;
                }
            }

            if (sym->name) {
                free(sym->name);
            }
            free(sym);
            sym = next;
        }
    }

    free(frame->buckets);
    frame->buckets = NULL;
}

SymbolTable *symbol_table_create(void) {
    SymbolTable *st = (SymbolTable *)malloc(sizeof(SymbolTable));
    if (!st) return NULL;

    st->exited_symbols = NULL;
    st->current_scope = scope_frame_create(0, NULL);
    if (!st->current_scope) {
        free(st);
        return NULL;
    }

    return st;
}

void symbol_table_destroy(SymbolTable *st) {
    if (!st) return;

    /* Free all active scope frames */
    ScopeFrame *frame = st->current_scope;
    while (frame) {
        ScopeFrame *parent = frame->parent;
        scope_frame_free_symbols(frame, NULL);
        free(frame);
        frame = parent;
    }
    st->current_scope = NULL;

    /* Free historical exited symbol records */
    ExitedSymbolRecord *rec = st->exited_symbols;
    while (rec) {
        ExitedSymbolRecord *next = rec->next;
        if (rec->name) free(rec->name);
        free(rec);
        rec = next;
    }
    st->exited_symbols = NULL;

    free(st);
}

void symbol_table_enter_scope(SymbolTable *st) {
    if (!st || !st->current_scope) return;

    int new_level = st->current_scope->level + 1;
    ScopeFrame *new_frame = scope_frame_create(new_level, st->current_scope);
    if (!new_frame) return;

    st->current_scope = new_frame;
}

int symbol_table_exit_scope(SymbolTable *st) {
    if (!st || !st->current_scope) return 0;

    /* Disallow exiting global scope (level 0) */
    if (st->current_scope->parent == NULL || st->current_scope->level == 0) {
        return 0;
    }

    ScopeFrame *old_frame = st->current_scope;
    st->current_scope = old_frame->parent;

    /* Free symbols in exiting frame, saving records for scope violation detection */
    scope_frame_free_symbols(old_frame, &st->exited_symbols);
    free(old_frame);

    return 1;
}

int symbol_table_get_scope_level(const SymbolTable *st) {
    if (!st || !st->current_scope) return 0;
    return st->current_scope->level;
}

Symbol *symbol_table_insert(SymbolTable *st, const char *name, DataType type, int line) {
    if (!st || !st->current_scope || !name) return NULL;

    /* Check for duplicate in the current scope frame */
    if (symbol_table_lookup_current_scope(st, name) != NULL) {
        return NULL; /* Already declared in current scope */
    }

    ScopeFrame *frame = st->current_scope;
    unsigned long h = hash_string(name) % frame->num_buckets;

    Symbol *sym = (Symbol *)malloc(sizeof(Symbol));
    if (!sym) return NULL;

    sym->name = strdup(name);
    sym->type = type;
    sym->scope_level = frame->level;
    sym->line = line;
    sym->next = frame->buckets[h];
    frame->buckets[h] = sym;

    frame->symbol_count++;
    return sym;
}

Symbol *symbol_table_lookup_current_scope(const SymbolTable *st, const char *name) {
    if (!st || !st->current_scope || !name) return NULL;

    ScopeFrame *frame = st->current_scope;
    unsigned long h = hash_string(name) % frame->num_buckets;

    Symbol *curr = frame->buckets[h];
    while (curr) {
        if (curr->name && strcmp(curr->name, name) == 0) {
            return curr;
        }
        curr = curr->next;
    }

    return NULL;
}

Symbol *symbol_table_lookup_all_scopes(const SymbolTable *st, const char *name) {
    if (!st || !st->current_scope || !name) return NULL;

    /* Traverse outward from innermost active frame to global root */
    ScopeFrame *frame = st->current_scope;
    while (frame) {
        unsigned long h = hash_string(name) % frame->num_buckets;
        Symbol *curr = frame->buckets[h];
        while (curr) {
            if (curr->name && strcmp(curr->name, name) == 0) {
                return curr;
            }
            curr = curr->next;
        }
        frame = frame->parent;
    }

    return NULL;
}

bool symbol_table_was_declared_in_exited_scope(const SymbolTable *st, const char *name, int *out_line) {
    if (!st || !name) return false;

    ExitedSymbolRecord *rec = st->exited_symbols;
    while (rec) {
        if (rec->name && strcmp(rec->name, name) == 0) {
            if (out_line) *out_line = rec->line;
            return true;
        }
        rec = rec->next;
    }

    return false;
}

typedef struct PrintableSymbol {
    const char *name;
    DataType type;
    int scope_level;
    int line;
} PrintableSymbol;

static int compare_printable_symbols(const void *a, const void *b) {
    const PrintableSymbol *pa = (const PrintableSymbol *)a;
    const PrintableSymbol *pb = (const PrintableSymbol *)b;
    if (pa->line != pb->line) {
        return (pa->line < pb->line) ? -1 : 1;
    }
    if (pa->scope_level != pb->scope_level) {
        return (pa->scope_level < pb->scope_level) ? -1 : 1;
    }
    return strcmp(pa->name ? pa->name : "", pb->name ? pb->name : "");
}

void symbol_table_print(const SymbolTable *st, FILE *out) {
    if (!st || !out) {
        return;
    }

    size_t count = 0;
    for (ScopeFrame *f = st->current_scope; f != NULL; f = f->parent) {
        for (size_t i = 0; i < f->num_buckets; i++) {
            for (Symbol *s = f->buckets[i]; s != NULL; s = s->next) {
                count++;
            }
        }
    }
    for (ExitedSymbolRecord *r = st->exited_symbols; r != NULL; r = r->next) {
        count++;
    }

    if (count == 0) {
        return;
    }

    PrintableSymbol *items = (PrintableSymbol *)malloc(count * sizeof(PrintableSymbol));
    if (!items) {
        return;
    }

    size_t idx = 0;
    for (ScopeFrame *f = st->current_scope; f != NULL; f = f->parent) {
        for (size_t i = 0; i < f->num_buckets; i++) {
            for (Symbol *s = f->buckets[i]; s != NULL; s = s->next) {
                items[idx].name = s->name;
                items[idx].type = s->type;
                items[idx].scope_level = s->scope_level;
                items[idx].line = s->line;
                idx++;
            }
        }
    }
    for (ExitedSymbolRecord *r = st->exited_symbols; r != NULL; r = r->next) {
        items[idx].name = r->name;
        items[idx].type = r->type;
        items[idx].scope_level = r->scope_level;
        items[idx].line = r->line;
        idx++;
    }

    qsort(items, idx, sizeof(PrintableSymbol), compare_printable_symbols);
    for (size_t i = 0; i < idx; i++) {
        fprintf(out, "Line %d: %s type=%s scope=%d\n",
                items[i].line,
                items[i].name ? items[i].name : "",
                datatype_to_string(items[i].type),
                items[i].scope_level);
    }

    free(items);
}
