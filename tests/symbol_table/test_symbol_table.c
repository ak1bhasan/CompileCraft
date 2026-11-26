/* ==============================================================================
 * CompileCraft - Scoped Symbol Table Unit Tests (Milestone 5)
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "../../src/symbol_table/symbol_table.h"

static void test_initialization(void) {
    printf("Running test_initialization...\n");
    SymbolTable *st = symbol_table_create();
    assert(st != NULL);
    assert(symbol_table_get_scope_level(st) == 0);
    symbol_table_destroy(st);
    printf("  [PASS] test_initialization\n");
}

static void test_global_declarations(void) {
    printf("Running test_global_declarations...\n");
    SymbolTable *st = symbol_table_create();

    Symbol *s1 = symbol_table_insert(st, "x", TYPE_INT, 5);
    assert(s1 != NULL);
    assert(strcmp(s1->name, "x") == 0);
    assert(s1->type == TYPE_INT);
    assert(s1->scope_level == 0);
    assert(s1->line == 5);

    Symbol *s2 = symbol_table_insert(st, "pi", TYPE_FLOAT, 6);
    assert(s2 != NULL);
    assert(s2->type == TYPE_FLOAT);

    Symbol *s3 = symbol_table_insert(st, "flag", TYPE_BOOL, 7);
    assert(s3 != NULL);
    assert(s3->type == TYPE_BOOL);
    assert(s1->array_size == 0 && s1->is_initialized == false);

    Symbol *s4 = symbol_table_insert_ext(st, "buf", TYPE_STRING, 8, 64, false);
    assert(s4 != NULL);
    assert(s4->type == TYPE_STRING);
    assert(s4->array_size == 64);
    assert(s4->is_initialized == false);

    Symbol *s5 = symbol_table_insert_ext(st, "in", TYPE_SCANNER, 9, 0, true);
    assert(s5 != NULL);
    assert(s5->type == TYPE_SCANNER);
    assert(s5->array_size == 0);
    assert(s5->is_initialized == true);
    assert(strcmp(datatype_to_string(TYPE_SCANNER), "Scanner") == 0);

    /* Lookup tests */
    Symbol *f1 = symbol_table_lookup_current_scope(st, "x");
    assert(f1 == s1);
    Symbol *f2 = symbol_table_lookup_all_scopes(st, "pi");
    assert(f2 == s2);
    Symbol *f_none = symbol_table_lookup_all_scopes(st, "nonexistent");
    assert(f_none == NULL);

    symbol_table_destroy(st);
    printf("  [PASS] test_global_declarations\n");
}

static void test_duplicate_detection(void) {
    printf("Running test_duplicate_detection...\n");
    SymbolTable *st = symbol_table_create();

    Symbol *s1 = symbol_table_insert(st, "count", TYPE_INT, 10);
    assert(s1 != NULL);

    /* Same name in same scope must be rejected */
    Symbol *s2 = symbol_table_insert(st, "count", TYPE_FLOAT, 12);
    assert(s2 == NULL);

    /* Existing symbol must remain untouched */
    Symbol *lookup = symbol_table_lookup_current_scope(st, "count");
    assert(lookup == s1);
    assert(lookup->type == TYPE_INT);

    symbol_table_destroy(st);
    printf("  [PASS] test_duplicate_detection\n");
}

static void test_nested_scopes_and_shadowing(void) {
    printf("Running test_nested_scopes_and_shadowing...\n");
    SymbolTable *st = symbol_table_create();

    /* Global scope (level 0) */
    symbol_table_insert(st, "x", TYPE_INT, 1);
    symbol_table_insert(st, "global_var", TYPE_BOOL, 2);

    /* Enter Block 1 (level 1) */
    symbol_table_enter_scope(st);
    assert(symbol_table_get_scope_level(st) == 1);

    /* Shadow 'x' with float in inner block */
    Symbol *inner_x = symbol_table_insert(st, "x", TYPE_FLOAT, 10);
    assert(inner_x != NULL);
    assert(inner_x->scope_level == 1);
    assert(inner_x->type == TYPE_FLOAT);

    /* Current scope lookup should find inner_x */
    assert(symbol_table_lookup_current_scope(st, "x") == inner_x);

    /* All scopes lookup should find inner_x (shadowing outer x) */
    assert(symbol_table_lookup_all_scopes(st, "x") == inner_x);

    /* Ancestral lookup finds global_var from level 1 */
    Symbol *found_global = symbol_table_lookup_all_scopes(st, "global_var");
    assert(found_global != NULL);
    assert(found_global->type == TYPE_BOOL);
    assert(found_global->scope_level == 0);

    /* Current scope lookup does NOT see global_var in level 1 */
    assert(symbol_table_lookup_current_scope(st, "global_var") == NULL);

    /* Enter Block 2 (level 2) */
    symbol_table_enter_scope(st);
    assert(symbol_table_get_scope_level(st) == 2);
    Symbol *deep_var = symbol_table_insert(st, "deep", TYPE_INT, 20);
    assert(deep_var != NULL);
    assert(symbol_table_lookup_all_scopes(st, "deep") == deep_var);
    assert(symbol_table_lookup_all_scopes(st, "x") == inner_x);

    /* Exit Block 2 back to level 1 */
    int exited = symbol_table_exit_scope(st);
    assert(exited == 1);
    assert(symbol_table_get_scope_level(st) == 1);

    /* 'deep' is no longer in scope */
    assert(symbol_table_lookup_all_scopes(st, "deep") == NULL);
    int decl_line = 0;
    assert(symbol_table_was_declared_in_exited_scope(st, "deep", &decl_line) == true);
    assert(decl_line == 20);

    /* Exit Block 1 back to global scope (level 0) */
    exited = symbol_table_exit_scope(st);
    assert(exited == 1);
    assert(symbol_table_get_scope_level(st) == 0);

    /* 'x' in global scope is restored to int */
    Symbol *outer_x = symbol_table_lookup_all_scopes(st, "x");
    assert(outer_x != NULL);
    assert(outer_x->type == TYPE_INT);
    assert(outer_x->scope_level == 0);

    /* Cannot exit global scope */
    assert(symbol_table_exit_scope(st) == 0);
    assert(symbol_table_get_scope_level(st) == 0);

    symbol_table_destroy(st);
    printf("  [PASS] test_nested_scopes_and_shadowing\n");
}

static void test_multiple_sibling_scopes(void) {
    printf("Running test_multiple_sibling_scopes...\n");
    SymbolTable *st = symbol_table_create();

    /* First sibling block */
    symbol_table_enter_scope(st);
    assert(symbol_table_insert(st, "sibling_var", TYPE_INT, 5) != NULL);
    symbol_table_exit_scope(st);

    /* Second sibling block can declare sibling_var without collision */
    symbol_table_enter_scope(st);
    Symbol *s2 = symbol_table_insert(st, "sibling_var", TYPE_FLOAT, 15);
    assert(s2 != NULL);
    assert(s2->type == TYPE_FLOAT);
    symbol_table_exit_scope(st);

    symbol_table_destroy(st);
    printf("  [PASS] test_multiple_sibling_scopes\n");
}

static void test_metadata_across_shadowing(void) {
    printf("Running test_metadata_across_shadowing...\n");
    SymbolTable *st = symbol_table_create();

    Symbol *outer = symbol_table_insert_ext(st, "name", TYPE_STRING, 2, 16, false);
    assert(outer != NULL && outer->array_size == 16 && !outer->is_initialized);

    symbol_table_enter_scope(st);
    Symbol *inner = symbol_table_insert_ext(st, "name", TYPE_STRING, 5, 32, true);
    assert(inner != NULL && inner->array_size == 32 && inner->is_initialized);
    assert(symbol_table_lookup_all_scopes(st, "name") == inner);

    /* Duplicate insert must fail without overwriting inner metadata */
    assert(symbol_table_insert_ext(st, "name", TYPE_SCANNER, 6, 0, false) == NULL);
    assert(inner->type == TYPE_STRING && inner->array_size == 32 && inner->is_initialized);

    symbol_table_exit_scope(st);
    Symbol *restored = symbol_table_lookup_all_scopes(st, "name");
    assert(restored == outer && restored->array_size == 16 && !restored->is_initialized);

    symbol_table_destroy(st);
    printf("  [PASS] test_metadata_across_shadowing\n");
}

int main(void) {
    printf("==============================================================================\n");
    printf(" CompileCraft - Scoped Symbol Table Unit Tests\n");
    printf("==============================================================================\n");

    test_initialization();
    test_global_declarations();
    test_duplicate_detection();
    test_nested_scopes_and_shadowing();
    test_multiple_sibling_scopes();
    test_metadata_across_shadowing();

    printf("==============================================================================\n");
    printf(" All Symbol Table unit tests passed successfully!\n");
    printf("==============================================================================\n");
    return 0;
}
