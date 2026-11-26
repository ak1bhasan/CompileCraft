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

    /* ast_list_take_single detaches a sole node cleanly without leaking or double-owning. */
    stmt = ast_empty_stmt(2, 1);
    expect(stmt != NULL, "allocate sole node for take_single");
    expect(ast_list_append(&list_a, stmt) == 1, "append sole node to list A");
    expect(ast_list_take_single(&list_a) == stmt, "take_single returns sole node");
    expect(list_a.head == NULL && list_a.tail == NULL, "list A is empty after take_single");
    expect(stmt->in_stmt_list == 0, "take_single clears internal membership flag inside ast.c");
    expect(ast_list_append(&list_b, stmt) == 1, "detached node can cleanly enter list B");

    /* take_single rejects multi-element lists cleanly without mutating list B. */
    {
        AstNode *stmt2 = ast_empty_stmt(3, 1);
        expect(stmt2 != NULL && ast_list_append(&list_b, stmt2) == 1, "append second node to list B");
        expect(ast_list_take_single(&list_b) == NULL, "take_single returns NULL for multi-element list");
        expect(list_b.head == stmt && list_b.tail == stmt2, "list B unchanged after rejected take_single");
    }

    /* Wrap multi-element list in AST_SEQ + test AST_OUTPUT item append/newline helpers. */
    {
        AstNode *seq = ast_seq(list_b, 2, 1);
        AstList items = ast_list_empty();
        AstNode *out_node = NULL;
        AstNode *item = ast_literal_int(42, 4, 1);
        expect(seq != NULL && seq->kind == AST_SEQ, "ast_seq creates AST_SEQ cleanly");
        expect(ast_output_append_item(NULL, item) == 0, "append_item rejects NULL output");
        out_node = ast_output(items, 0, 4, 1);
        expect(out_node != NULL, "ast_output creates AST_OUTPUT");
        expect(ast_output_append_item(out_node, item) == 1, "ast_output_append_item appends cleanly");
        expect(ast_output_set_newline(out_node, 1) == 1 && out_node->u.output_stmt.newline == 1,
               "ast_output_set_newline updates newline cleanly");
        ast_free(out_node);
        ast_free(seq);
    }

    if (failures != 0) {
        fprintf(stderr, "AST list ownership test: %d check(s) failed.\n", failures);
        return 1;
    }

    printf("AST list ownership test: PASS\n");
    return 0;
}
