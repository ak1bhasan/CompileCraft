/* ==============================================================================
 * CompileCraft - AST list ownership unit test (M4.2.7)
 *
 * Verifies that a node already owned by one AstList cannot be appended to
 * another list, that the rejected destination stays unchanged, and that the
 * owning list frees the node exactly once.
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ast.h"

static int failures = 0;

static char *test_strdup(const char *s) {
    size_t len = strlen(s) + 1;
    char *copy = (char *)malloc(len);
    if (copy) {
        memcpy(copy, s, len);
    }
    return copy;
}

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

    /* M16 Step 1: bounded array decls, AST_INPUT, AST_ADDR_OF, AST_SCANNER_NEW, AST_INPUT_CALL. */
    {
        AstNode *buf_decl = ast_var_decl_array(
            AST_TYPE_STRING, ast_identifier(test_strdup("buf"), 5, 1), 32, NULL, 5, 1);
        AstNode *bad_decl = ast_var_decl_array(
            AST_TYPE_STRING, ast_identifier(test_strdup("bad"), 5, 1), -1, NULL, 5, 1);
        expect(buf_decl != NULL && buf_decl->u.var_decl.array_size == 32 &&
                   buf_decl->u.var_decl.type_tag == AST_TYPE_STRING,
               "ast_var_decl_array records array_size and AST_TYPE_STRING");
        expect(bad_decl == NULL, "ast_var_decl_array rejects negative array_size and frees name");

        AstNode *scan_new = ast_scanner_new(test_strdup("Scanner"), test_strdup("System.in"), 6, 1);
        AstNode *sc_decl = ast_var_decl(
            AST_TYPE_SCANNER, ast_identifier(test_strdup("sc"), 6, 1), scan_new, 6, 1);
        expect(sc_decl != NULL && sc_decl->u.var_decl.type_tag == AST_TYPE_SCANNER,
               "ast_scanner_new and AST_TYPE_SCANNER var_decl succeed");
        expect(ast_scanner_new(test_strdup("Scanner"), NULL, 6, 1) == NULL,
               "ast_scanner_new rejects NULL source_name safely");

        AstNode *call_ok = ast_input_call(
            ast_identifier(test_strdup("sc"), 7, 1), test_strdup("nextInt"), 7, 1);
        AstNode *call_bad = ast_input_call(ast_literal_int(1, 7, 1), test_strdup("nextInt"), 7, 1);
        expect(call_ok != NULL && call_ok->kind == AST_INPUT_CALL,
               "ast_input_call accepts identifier receiver");
        expect(call_bad == NULL, "ast_input_call rejects non-identifier receiver safely");

        AstNode *in_node = ast_input(ast_list_empty(), AST_INPUT_SCANF, 8, 1);
        AstNode *addr = ast_addr_of(ast_identifier(test_strdup("n"), 8, 1), 8, 1);
        AstList other = ast_list_empty();
        expect(in_node != NULL && addr != NULL && addr->kind == AST_ADDR_OF,
               "ast_input and ast_addr_of allocate cleanly");
        expect(ast_input_append_item(in_node, addr) == 1,
               "ast_input_append_item transfers ownership cleanly");
        expect(ast_list_append(&other, addr) == 0,
               "node owned by AST_INPUT cannot be appended to another AstList");

        FILE *fp = tmpfile();
        expect(fp != NULL, "tmpfile opens for M16 AST print check");
        if (fp != NULL) {
            ast_print(buf_decl, fp);
            ast_print(sc_decl, fp);
            ast_print(call_ok, fp);
            ast_print(in_node, fp);
            rewind(fp);
            char printed[512];
            size_t n = fread(printed, 1, sizeof(printed) - 1, fp);
            printed[n] = '\0';
            expect(strstr(printed, "VarDecl string[32]") != NULL &&
                       strstr(printed, "VarDecl Scanner") != NULL &&
                       strstr(printed, "ScannerNew Scanner(System.in)") != NULL &&
                       strstr(printed, "InputCall nextInt") != NULL &&
                       strstr(printed, "InputScanf") != NULL &&
                       strstr(printed, "AddrOf") != NULL,
                   "ast_print formats all new M16 AST nodes");
            fclose(fp);
        }

        ast_free(other.head);
        ast_free(in_node);
        ast_free(call_ok);
        ast_free(sc_decl);
        ast_free(buf_decl);
    }

    if (failures != 0) {
        fprintf(stderr, "AST list ownership test: %d check(s) failed.\n", failures);
        return 1;
    }

    printf("AST list ownership test: PASS\n");
    return 0;
}
