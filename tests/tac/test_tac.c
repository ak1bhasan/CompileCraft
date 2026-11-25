/* ==============================================================================
 * CompileCraft - Three-Address Code (TAC) Unit Tests (Milestone 7)
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "../../src/ast/ast.h"
#include "../../src/tac/tac.h"

static void test_arithmetic_tac(void) {
    printf("Running test_arithmetic_tac...\n");

    /* Program:
     * int x;
     * x = 10 + 20 * 3;
     */
    AstList stmts = ast_list_empty();

    AstNode *decl = ast_var_decl(AST_TYPE_INT, ast_identifier(strdup("x"), 1, 1), NULL, 1, 1);
    ast_list_append(&stmts, decl);

    AstNode *mul_expr = ast_binary(AST_OP_MUL, ast_literal_int(20, 2, 10), ast_literal_int(3, 2, 15), 2, 12);
    AstNode *add_expr = ast_binary(AST_OP_ADD, ast_literal_int(10, 2, 5), mul_expr, 2, 7);
    AstNode *assign = ast_assign(ast_identifier(strdup("x"), 2, 1), add_expr, 2, 3);
    ast_list_append(&stmts, assign);

    AstNode *prog = ast_program(stmts, 1, 1);
    assert(prog != NULL);

    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);
    assert(tac->count >= 3); /* t1 = 20 * 3; t2 = 10 + t1; x = t2 */

    /* Verify instruction contents */
    TacInstr *i1 = tac->head;
    assert(i1->opcode == TAC_OP_MUL);
    assert(strcmp(i1->dest, "t1") == 0);
    assert(strcmp(i1->src1, "20") == 0);
    assert(strcmp(i1->src2, "3") == 0);

    TacInstr *i2 = i1->next;
    assert(i2->opcode == TAC_OP_ADD);
    assert(strcmp(i2->dest, "t2") == 0);
    assert(strcmp(i2->src1, "10") == 0);
    assert(strcmp(i2->src2, "t1") == 0);

    TacInstr *i3 = i2->next;
    assert(i3->opcode == TAC_OP_ASSIGN);
    assert(strcmp(i3->dest, "x") == 0);
    assert(strcmp(i3->src1, "t2") == 0);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_arithmetic_tac\n");
}

static void test_control_flow_tac(void) {
    printf("Running test_control_flow_tac...\n");

    /* Program:
     * while (x > 0) {
     *     x = x - 1;
     * }
     */
    AstList stmts = ast_list_empty();

    AstNode *cond = ast_binary(AST_OP_GT, ast_identifier(strdup("x"), 1, 8), ast_literal_int(0, 1, 12), 1, 10);

    AstList body_stmts = ast_list_empty();
    AstNode *sub_expr = ast_binary(AST_OP_SUB, ast_identifier(strdup("x"), 2, 9), ast_literal_int(1, 2, 13), 2, 11);
    AstNode *assign = ast_assign(ast_identifier(strdup("x"), 2, 5), sub_expr, 2, 7);
    ast_list_append(&body_stmts, assign);
    AstNode *body_block = ast_block(body_stmts, 1, 15);

    AstNode *loop = ast_while(cond, body_block, 1, 1);
    ast_list_append(&stmts, loop);

    AstNode *prog = ast_program(stmts, 1, 1);
    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);

    /* Verify while structure:
     * L1:
     * t1 = x > 0
     * if t1 goto L2
     * goto L3
     * L2:
     * t2 = x - 1
     * x = t2
     * goto L1
     * L3:
     */
    TacInstr *curr = tac->head;
    assert(curr != NULL && curr->opcode == TAC_OP_LABEL); /* L1 */
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_GT);    /* t1 = x > 0 */
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_IF_GOTO); /* if t1 goto L2 */
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_GOTO);    /* goto L3 */
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_LABEL); /* L2 */

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_control_flow_tac\n");
}

int main(void) {
    printf("==============================================================================\n");
    printf(" CompileCraft - Three-Address Code (TAC) Unit Tests\n");
    printf("==============================================================================\n");

    test_arithmetic_tac();
    test_control_flow_tac();

    printf("==============================================================================\n");
    printf(" All TAC unit tests passed successfully!\n");
    printf("==============================================================================\n");
    return 0;
}
