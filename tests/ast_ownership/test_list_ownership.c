/* ==============================================================================
 * CompileCraft - AST list ownership unit test (M4.2.7)
 *
 * Verifies that a node already owned by one AstList cannot be appended to
 * another list, that the rejected destination stays unchanged, and that the
 * owning list frees the node exactly once.
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>

#include "ast.h"

static int failures = 0;

static void expect(int cond, const char *msg) {
    if (!cond) {
        fprintf(stderr, "[FAIL] %s\n", msg);
        failures++;
    }
}

int main(void) {
    AstList list_a;
    AstList list_b;
    AstNode *stmt;
    int appended;

    list_a = ast_list_empty();
    list_b = ast_list_empty();

    stmt = ast_empty_stmt(1, 1);
    expect(stmt != NULL, "ast_empty_stmt allocated a statement node");
    if (stmt == NULL) {
        return 1;
    }
    expect(stmt->in_stmt_list == 0, "fresh node is not list-owned");
    expect(stmt->next == NULL, "fresh node has no sibling link");

    appended = ast_list_append(&list_a, stmt);
    expect(appended == 1, "first append to list A succeeds");
    expect(list_a.head == stmt, "list A head is the statement");
    expect(list_a.tail == stmt, "list A tail is the statement");
    expect(stmt->in_stmt_list == 1, "statement is marked list-owned after append");
    expect(ast_list_head(list_a) == stmt, "ast_list_head returns the owned node");

    appended = ast_list_append(&list_b, stmt);
    expect(appended == 0, "second append to list B is rejected");
    expect(list_b.head == NULL, "list B head remains NULL");
    expect(list_b.tail == NULL, "list B tail remains NULL");
    expect(list_a.head == stmt, "list A still owns the original node");
    expect(list_a.tail == stmt, "list A tail is unchanged");
    expect(stmt->in_stmt_list == 1, "node remains owned by list A");
    expect(stmt->next == NULL, "node sibling link unchanged after rejection");

    /* B never owned the node; freeing an empty list head is a no-op. */
    ast_free(list_b.head);
    list_b = ast_list_empty();

    /* A owns the node — free exactly once through the list head. */
    ast_free(list_a.head);
    list_a = ast_list_empty();

    if (failures != 0) {
        fprintf(stderr, "AST list ownership test: %d check(s) failed.\n", failures);
        return 1;
    }

    printf("AST list ownership test: PASS\n");
    return 0;
}
