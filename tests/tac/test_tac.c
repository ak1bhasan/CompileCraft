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

    AstList stmts = ast_list_empty();
    AstNode *decl = ast_var_decl(AST_TYPE_INT, ast_identifier(strdup("x"), 1, 1), NULL, 1, 1);
    assert(ast_list_append(&stmts, decl));

    AstNode *mul_expr = ast_binary(
        AST_OP_MUL, ast_literal_int(20, 2, 10), ast_literal_int(3, 2, 15), 2, 12);
    AstNode *add_expr = ast_binary(
        AST_OP_ADD, ast_literal_int(10, 2, 5), mul_expr, 2, 7);
    AstNode *assign = ast_assign(ast_identifier(strdup("x"), 2, 1), add_expr, 2, 3);
    assert(ast_list_append(&stmts, assign));

    AstNode *prog = ast_program(stmts, 1, 1);
    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);
    assert(tac->count >= 3);

    TacInstr *i1 = tac->head;
    assert(i1->opcode == TAC_OP_MUL);
    assert(strcmp(i1->dest, "t1") == 0);
    assert(strcmp(i1->src1, "20") == 0);
    assert(strcmp(i1->src2, "3") == 0);

    TacInstr *i2 = i1->next;
    assert(i2->opcode == TAC_OP_ADD);
    assert(strcmp(i2->dest, "t2") == 0);

    TacInstr *i3 = i2->next;
    assert(i3->opcode == TAC_OP_ASSIGN);
    assert(strcmp(i3->dest, "x") == 0);
    assert(strcmp(i3->src1, "t2") == 0);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_arithmetic_tac\n");
}

static void test_relational_logical_unary(void) {
    printf("Running test_relational_logical_unary...\n");

    AstList stmts = ast_list_empty();
    assert(ast_list_append(
        &stmts,
        ast_var_decl(AST_TYPE_BOOL, ast_identifier(strdup("b"), 1, 1), NULL, 1, 1)));

    AstNode *gt = ast_binary(
        AST_OP_GT,
        ast_identifier(strdup("x"), 2, 5),
        ast_literal_int(0, 2, 9),
        2,
        7);
    AstNode *lt = ast_binary(
        AST_OP_LT,
        ast_identifier(strdup("y"), 2, 14),
        ast_literal_int(10, 2, 18),
        2,
        16);
    AstNode *and_expr = ast_binary(AST_OP_AND, gt, lt, 2, 12);
    AstNode *not_expr = ast_unary(AST_OP_NOT, and_expr, 2, 1);
    assert(ast_list_append(
        &stmts, ast_assign(ast_identifier(strdup("b"), 2, 1), not_expr, 2, 3)));

    AstNode *prog = ast_program(stmts, 1, 1);
    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);

    int saw_gt = 0;
    int saw_lt = 0;
    int saw_and = 0;
    int saw_not = 0;
    for (TacInstr *curr = tac->head; curr; curr = curr->next) {
        if (curr->opcode == TAC_OP_GT) {
            saw_gt = 1;
        }
        if (curr->opcode == TAC_OP_LT) {
            saw_lt = 1;
        }
        if (curr->opcode == TAC_OP_AND) {
            saw_and = 1;
        }
        if (curr->opcode == TAC_OP_NOT) {
            saw_not = 1;
        }
    }
    assert(saw_gt && saw_lt && saw_and && saw_not);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_relational_logical_unary\n");
}

static void test_init_and_print(void) {
    printf("Running test_init_and_print...\n");

    AstList stmts = ast_list_empty();
    AstNode *init = ast_literal_int(42, 1, 9);
    assert(ast_list_append(
        &stmts,
        ast_var_decl(AST_TYPE_INT, ast_identifier(strdup("n"), 1, 5), init, 1, 1)));
    assert(ast_list_append(
        &stmts, ast_print_stmt(ast_identifier(strdup("n"), 2, 7), 2, 1)));

    AstNode *prog = ast_program(stmts, 1, 1);
    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);
    assert(tac->head->opcode == TAC_OP_ASSIGN);
    assert(strcmp(tac->head->dest, "n") == 0);
    assert(strcmp(tac->head->src1, "42") == 0);
    assert(tac->head->next->opcode == TAC_OP_PRINT);
    assert(strcmp(tac->head->next->src1, "n") == 0);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_init_and_print\n");
}

static void test_if_else_tac(void) {
    printf("Running test_if_else_tac...\n");

    AstList stmts = ast_list_empty();
    AstNode *cond = ast_binary(
        AST_OP_EQ,
        ast_identifier(strdup("flag"), 1, 5),
        ast_literal_bool(1, 1, 13),
        1,
        10);

    AstList then_stmts = ast_list_empty();
    assert(ast_list_append(&then_stmts, ast_print_stmt(ast_identifier(strdup("y"), 2, 11), 2, 5)));
    AstNode *then_block = ast_block(then_stmts, 1, 20);

    AstList else_stmts = ast_list_empty();
    assert(ast_list_append(&else_stmts, ast_print_stmt(ast_identifier(strdup("x"), 4, 11), 4, 5)));
    AstNode *else_block = ast_block(else_stmts, 3, 8);

    assert(ast_list_append(&stmts, ast_if(cond, then_block, else_block, 1, 1)));

    AstNode *prog = ast_program(stmts, 1, 1);
    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);

    int labels = 0;
    int if_gotos = 0;
    int gotos = 0;
    int prints = 0;
    for (TacInstr *curr = tac->head; curr; curr = curr->next) {
        if (curr->opcode == TAC_OP_LABEL) {
            labels++;
        }
        if (curr->opcode == TAC_OP_IF_GOTO) {
            if_gotos++;
        }
        if (curr->opcode == TAC_OP_GOTO) {
            gotos++;
        }
        if (curr->opcode == TAC_OP_PRINT) {
            prints++;
        }
    }
    assert(labels >= 3);
    assert(if_gotos == 1);
    assert(gotos >= 2);
    assert(prints == 2);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_if_else_tac\n");
}

static void test_while_tac(void) {
    printf("Running test_while_tac...\n");

    AstList stmts = ast_list_empty();
    AstNode *cond = ast_binary(
        AST_OP_GT,
        ast_identifier(strdup("x"), 1, 8),
        ast_literal_int(0, 1, 12),
        1,
        10);

    AstList body_stmts = ast_list_empty();
    AstNode *sub_expr = ast_binary(
        AST_OP_SUB,
        ast_identifier(strdup("x"), 2, 9),
        ast_literal_int(1, 2, 13),
        2,
        11);
    assert(ast_list_append(
        &body_stmts, ast_assign(ast_identifier(strdup("x"), 2, 5), sub_expr, 2, 7)));
    AstNode *body_block = ast_block(body_stmts, 1, 15);
    assert(ast_list_append(&stmts, ast_while(cond, body_block, 1, 1)));

    AstNode *prog = ast_program(stmts, 1, 1);
    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);

    TacInstr *curr = tac->head;
    assert(curr != NULL && curr->opcode == TAC_OP_LABEL);
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_GT);
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_IF_GOTO);
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_GOTO);
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_LABEL);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_while_tac\n");
}

static void test_nested_blocks_order(void) {
    printf("Running test_nested_blocks_order...\n");

    AstList inner = ast_list_empty();
    assert(ast_list_append(
        &inner,
        ast_assign(
            ast_identifier(strdup("y"), 3, 5),
            ast_literal_int(2, 3, 9),
            3,
            7)));
    AstNode *inner_block = ast_block(inner, 2, 1);

    AstList outer = ast_list_empty();
    assert(ast_list_append(
        &outer,
        ast_assign(
            ast_identifier(strdup("x"), 2, 5),
            ast_literal_int(1, 2, 9),
            2,
            7)));
    assert(ast_list_append(&outer, inner_block));
    AstNode *outer_block = ast_block(outer, 1, 1);

    AstList stmts = ast_list_empty();
    assert(ast_list_append(&stmts, outer_block));
    AstNode *prog = ast_program(stmts, 1, 1);

    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);
    assert(tac->head->opcode == TAC_OP_ASSIGN);
    assert(strcmp(tac->head->dest, "x") == 0);
    assert(tac->head->next->opcode == TAC_OP_ASSIGN);
    assert(strcmp(tac->head->next->dest, "y") == 0);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_nested_blocks_order\n");
}

int main(void) {
    printf("==============================================================================\n");
    printf(" CompileCraft - Three-Address Code (TAC) Unit Tests\n");
    printf("==============================================================================\n");

    test_arithmetic_tac();
    test_relational_logical_unary();
    test_init_and_print();
    test_if_else_tac();
    test_while_tac();
    test_nested_blocks_order();

    printf("==============================================================================\n");
    printf(" All TAC unit tests passed successfully!\n");
    printf("==============================================================================\n");
    return 0;
}
