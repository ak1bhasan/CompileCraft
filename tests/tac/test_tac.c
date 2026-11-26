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

static void test_output_and_println_tac(void) {
    printf("Running test_output_and_println_tac...\n");

    AstList items = ast_list_empty();
    assert(ast_list_append(&items, ast_literal_string(strdup("\"Count: \""), 2, 5)));
    assert(ast_list_append(
        &items,
        ast_binary(
            AST_OP_ADD,
            ast_identifier(strdup("n"), 2, 16),
            ast_literal_int(1, 2, 20),
            2,
            18)));

    AstList stmts = ast_list_empty();
    assert(ast_list_append(&stmts, ast_output(items, 1, 2, 5)));
    assert(ast_list_append(&stmts, ast_output(ast_list_empty(), 1, 3, 5)));
    AstNode *prog = ast_program(stmts, 1, 1);

    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);

    TacInstr *curr = tac->head;
    assert(curr != NULL && curr->opcode == TAC_OP_PRINT);
    assert(strcmp(curr->src1, "\"Count: \"") == 0);
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_ADD);
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_PRINTLN);
    assert(strcmp(curr->src1, "t1") == 0);
    curr = curr->next;
    assert(curr != NULL && curr->opcode == TAC_OP_PRINTLN);
    assert(curr->src1 == NULL);
    assert(curr->next == NULL);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_output_and_println_tac\n");
}

static void test_printf_seq_and_concat_tac(void) {
    printf("Running test_printf_seq_and_concat_tac...\n");

    /* 1. AST_OUTPUT_PRINTF emits TAC_OP_ARG in order followed by TAC_OP_PRINTF. */
    AstList pf_items = ast_list_empty();
    assert(ast_list_append(&pf_items, ast_literal_string(strdup("\"%d %f\""), 2, 5)));
    assert(ast_list_append(&pf_items, ast_identifier(strdup("sum"), 2, 20)));
    assert(ast_list_append(&pf_items, ast_identifier(strdup("avg"), 2, 25)));
    AstNode *pf_node = ast_output_with_mode(pf_items, AST_OUTPUT_PRINTF, 0, 2, 5);

    /* 2. AST_OUTPUT_CONCAT preserves arithmetic before string concat in TAC. */
    AstNode *add_num = ast_binary(
        AST_OP_ADD, ast_literal_int(1, 3, 24), ast_literal_int(2, 3, 28), 3, 26);
    AstNode *concat = ast_binary(
        AST_OP_ADD, add_num, ast_literal_string(strdup("\"a\""), 3, 32), 3, 30);
    AstList java_items = ast_list_empty();
    assert(ast_list_append(&java_items, concat));
    AstNode *java_node = ast_output_with_mode(java_items, AST_OUTPUT_CONCAT, 1, 3, 5);

    /* 3. AST_SEQ emits children sequentially without changing scopes. */
    AstList seq_stmts = ast_list_empty();
    assert(ast_list_append(&seq_stmts, pf_node));
    assert(ast_list_append(&seq_stmts, java_node));
    AstNode *seq = ast_seq(seq_stmts, 2, 5);

    AstList prog_stmts = ast_list_empty();
    assert(ast_list_append(&prog_stmts, seq));
    AstNode *prog = ast_program(prog_stmts, 1, 1);

    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);

    TacInstr *curr = tac->head;
    assert(curr && curr->opcode == TAC_OP_ARG && strcmp(curr->src1, "sum") == 0);
    curr = curr->next;
    assert(curr && curr->opcode == TAC_OP_ARG && strcmp(curr->src1, "avg") == 0);
    curr = curr->next;
    assert(curr && curr->opcode == TAC_OP_PRINTF && strcmp(curr->src1, "\"%d %f\"") == 0);
    curr = curr->next;
    assert(curr && curr->opcode == TAC_OP_ADD);
    curr = curr->next;
    assert(curr && curr->opcode == TAC_OP_PRINT && strcmp(curr->src1, "t1") == 0);
    curr = curr->next;
    assert(curr && curr->opcode == TAC_OP_PRINTLN && strcmp(curr->src1, "\"a\"") == 0);
    assert(curr->next == NULL);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_printf_seq_and_concat_tac\n");
}

static void test_input_opcodes_and_string_concat_tac(void) {
    printf("Running test_input_opcodes_and_string_concat_tac...\n");

    AstList stmts = ast_list_empty();

    /* C declarations + scanf("%% %d,%15s ", &num, buf) */
    assert(ast_list_append(
        &stmts, ast_var_decl(AST_TYPE_INT, ast_identifier(strdup("num"), 1, 1), NULL, 1, 1)));
    assert(ast_list_append(
        &stmts, ast_var_decl_array(AST_TYPE_STRING, ast_identifier(strdup("buf"), 2, 1), 32, NULL, 2, 1)));

    AstList scanf_items = ast_list_empty();
    assert(ast_list_append(&scanf_items, ast_literal_string(strdup("\"%% %d,%15s \""), 3, 1)));
    assert(ast_list_append(&scanf_items, ast_addr_of(ast_identifier(strdup("num"), 3, 1), 3, 1)));
    assert(ast_list_append(&scanf_items, ast_identifier(strdup("buf"), 3, 1)));
    assert(ast_list_append(&stmts, ast_input(scanf_items, AST_INPUT_SCANF, 3, 1)));

    /* C++ chained cin >> num >> ratio >> ok >> line_tok */
    assert(ast_list_append(
        &stmts, ast_var_decl(AST_TYPE_FLOAT, ast_identifier(strdup("ratio"), 4, 1), NULL, 4, 1)));
    assert(ast_list_append(
        &stmts, ast_var_decl(AST_TYPE_BOOL, ast_identifier(strdup("ok"), 5, 1), NULL, 5, 1)));
    assert(ast_list_append(
        &stmts, ast_var_decl(AST_TYPE_STRING, ast_identifier(strdup("word"), 6, 1), NULL, 6, 1)));

    AstList cin_items = ast_list_empty();
    assert(ast_list_append(&cin_items, ast_identifier(strdup("num"), 7, 1)));
    assert(ast_list_append(&cin_items, ast_identifier(strdup("ratio"), 7, 1)));
    assert(ast_list_append(&cin_items, ast_identifier(strdup("ok"), 7, 1)));
    assert(ast_list_append(&cin_items, ast_identifier(strdup("word"), 7, 1)));
    assert(ast_list_append(&stmts, ast_input(cin_items, AST_INPUT_CIN, 7, 1)));

    /* Java Scanner handle + nextLine() + String var concat (word + 42) */
    assert(ast_list_append(
        &stmts,
        ast_var_decl(AST_TYPE_SCANNER,
                     ast_identifier(strdup("sc"), 8, 1),
                     ast_scanner_new(strdup("Scanner"), strdup("System.in"), 8, 1),
                     8, 1)));
    assert(ast_list_append(
        &stmts,
        ast_var_decl(AST_TYPE_STRING,
                     ast_identifier(strdup("line"), 9, 1),
                     ast_input_call(ast_identifier(strdup("sc"), 9, 1), strdup("nextLine"), 9, 1),
                     9, 1)));

    AstList concat_items = ast_list_empty();
    assert(ast_list_append(
        &concat_items,
        ast_binary(AST_OP_ADD,
                   ast_identifier(strdup("word"), 10, 1),
                   ast_literal_int(42, 10, 1),
                   10, 1)));
    assert(ast_list_append(&stmts, ast_output_with_mode(concat_items, AST_OUTPUT_CONCAT, 1, 10, 1)));

    AstNode *prog = ast_program(stmts, 1, 1);
    TacList *tac = tac_generate_program(prog);
    assert(tac != NULL);

    FILE *fp = tmpfile();
    assert(fp != NULL);
    tac_print(tac, fp);
    rewind(fp);
    char printed[1024];
    size_t n = fread(printed, 1, sizeof(printed) - 1, fp);
    printed[n] = '\0';
    fclose(fp);

    const char *expected =
        "scan_lit \"%\"\n"
        "scan_ws\n"
        "num = read_int prefix\n"
        "scan_lit \",\"\n"
        "buf = read_str 15\n"
        "num = read_int prefix\n"
        "ratio = read_float prefix\n"
        "ok = read_bool cpp\n"
        "word = read_str\n"
        "t1 = read_line\n"
        "line = t1\n"
        "print word\n"
        "println 42\n";
    assert(strcmp(printed, expected) == 0);

    tac_list_free(tac);
    ast_free(prog);
    printf("  [PASS] test_input_opcodes_and_string_concat_tac\n");
}

static AstNode *build_scanf_prog(const char *var_name, AstTypeTag var_type, int array_size,
                                 const char *fmt, int n_args, const char **arg_names, int *use_addr) {
    AstList stmts = ast_list_empty();
    if (var_name) {
        assert(ast_list_append(
            &stmts, ast_var_decl_array(var_type, ast_identifier(strdup(var_name), 1, 1), array_size, NULL, 1, 1)));
    }
    AstList items = ast_list_empty();
    assert(ast_list_append(&items, ast_literal_string(strdup(fmt), 2, 1)));
    for (int i = 0; i < n_args; i++) {
        AstNode *id = ast_identifier(strdup(arg_names[i]), 2, 1);
        AstNode *arg = use_addr[i] ? ast_addr_of(id, 2, 1) : id;
        assert(ast_list_append(&items, arg));
    }
    assert(ast_list_append(&stmts, ast_input(items, AST_INPUT_SCANF, 2, 1)));
    return ast_program(stmts, 1, 1);
}

static void test_scanf_bounds_and_validation_tac(void) {
    printf("Running test_scanf_bounds_and_validation_tac...\n");

    const char *one_s[1] = { "s" };
    int no_addr[1] = { 0 };
    int with_addr[1] = { 1 };
    const char *two_d[2] = { "n", "m" };
    int two_addr[2] = { 1, 1 };

    /* 1. char s[1] with %s must fail (0 writable capacity). */
    AstNode *p1 = build_scanf_prog("s", AST_TYPE_STRING, 1, "\"%s\"", 1, one_s, no_addr);
    assert(tac_generate_program(p1) == NULL);
    ast_free(p1);

    /* 2. char s[1] with %1s must fail cleanly. */
    AstNode *p2 = build_scanf_prog("s", AST_TYPE_STRING, 1, "\"%1s\"", 1, one_s, no_addr);
    assert(tac_generate_program(p2) == NULL);
    ast_free(p2);

    /* 3. char s[10] with %s limits read_str to 9 chars. */
    AstNode *p3 = build_scanf_prog("s", AST_TYPE_STRING, 10, "\"%s\"", 1, one_s, no_addr);
    TacList *t3 = tac_generate_program(p3);
    assert(t3 != NULL && t3->count == 1 && t3->head->opcode == TAC_OP_READ_STR);
    assert(t3->head->src1 && strcmp(t3->head->src1, "9") == 0);
    tac_list_free(t3);
    ast_free(p3);

    /* 4. char s[10] with %5s chooses smaller limit 5. */
    AstNode *p4 = build_scanf_prog("s", AST_TYPE_STRING, 10, "\"%5s\"", 1, one_s, no_addr);
    TacList *t4 = tac_generate_program(p4);
    assert(t4 != NULL && t4->count == 1 && t4->head->opcode == TAC_OP_READ_STR);
    assert(t4->head->src1 && strcmp(t4->head->src1, "5") == 0);
    tac_list_free(t4);
    ast_free(p4);

    /* 5. Invalid %0s must fail cleanly. */
    AstNode *p5 = build_scanf_prog("s", AST_TYPE_STRING, 10, "\"%0s\"", 1, one_s, no_addr);
    assert(tac_generate_program(p5) == NULL);
    ast_free(p5);

    /* 6. Missing scanf argument must fail cleanly without partial TAC. */
    AstNode *p6 = build_scanf_prog("n", AST_TYPE_INT, 0, "\"%d %d\"", 1, one_s, with_addr);
    assert(tac_generate_program(p6) == NULL);
    ast_free(p6);

    /* 7. Extra unused AST argument must fail cleanly without partial TAC. */
    AstNode *p7 = build_scanf_prog("n", AST_TYPE_INT, 0, "\"%d\"", 2, two_d, two_addr);
    assert(tac_generate_program(p7) == NULL);
    ast_free(p7);

    /* 8. Multi-specifier valid scanf with explicit %5s + %d + literal separator preserves exact order. */
    AstList stmts = ast_list_empty();
    assert(ast_list_append(&stmts, ast_var_decl(AST_TYPE_INT, ast_identifier(strdup("a"), 1, 1), NULL, 1, 1)));
    assert(ast_list_append(&stmts, ast_var_decl_array(AST_TYPE_STRING, ast_identifier(strdup("s"), 2, 1), 10, NULL, 2, 1)));
    AstList items = ast_list_empty();
    assert(ast_list_append(&items, ast_literal_string(strdup("\"%d:%5s\""), 3, 1)));
    assert(ast_list_append(&items, ast_addr_of(ast_identifier(strdup("a"), 3, 1), 3, 1)));
    assert(ast_list_append(&items, ast_identifier(strdup("s"), 3, 1)));
    assert(ast_list_append(&stmts, ast_input(items, AST_INPUT_SCANF, 3, 1)));
    AstNode *p8 = ast_program(stmts, 1, 1);
    TacList *t8 = tac_generate_program(p8);
    assert(t8 != NULL && t8->count == 3);
    assert(t8->head->opcode == TAC_OP_READ_INT && strcmp(t8->head->dest, "a") == 0);
    assert(t8->head->next->opcode == TAC_OP_SCAN_LIT && strcmp(t8->head->next->src1, "\":\"") == 0);
    assert(t8->head->next->next->opcode == TAC_OP_READ_STR && strcmp(t8->head->next->next->src1, "5") == 0);
    tac_list_free(t8);
    ast_free(p8);

    printf("  [PASS] test_scanf_bounds_and_validation_tac\n");
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
    test_output_and_println_tac();
    test_printf_seq_and_concat_tac();
    test_input_opcodes_and_string_concat_tac();
    test_scanf_bounds_and_validation_tac();

    printf("==============================================================================\n");
    printf(" All TAC unit tests passed successfully!\n");
    printf("==============================================================================\n");
    return 0;
}
