/* ==============================================================================
 * CompileCraft - Shared TAC VM Unit Test Suite (Milestone 15)
 *
 * Tests VmValue helpers, instruction execution, control flow, loops,
 * printf/print/println formatting, runtime errors, and step-limit protection.
 * ============================================================================== */

#include "tac.h"
#include "vm.h"
#include <assert.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *dup_str(const char *s) {
    if (!s) {
        return NULL;
    }
    size_t len = strlen(s);
    char *copy = (char *)malloc(len + 1);
    assert(copy != NULL);
    memcpy(copy, s, len + 1);
    return copy;
}

static void append_instr(
    TacList *list,
    TacOpcode op,
    const char *dest,
    const char *src1,
    const char *src2,
    int line) {
    TacInstr *instr = (TacInstr *)malloc(sizeof(TacInstr));
    assert(instr != NULL);
    instr->opcode = op;
    instr->dest = dup_str(dest);
    instr->src1 = dup_str(src1);
    instr->src2 = dup_str(src2);
    instr->line = line;
    instr->next = NULL;

    if (!list->head) {
        list->head = instr;
        list->tail = instr;
    } else {
        list->tail->next = instr;
        list->tail = instr;
    }
    list->count++;
}

static TacList *new_tac_list(void) {
    TacList *list = (TacList *)calloc(1, sizeof(TacList));
    assert(list != NULL);
    return list;
}

static void read_file_content(FILE *fp, char *buf, size_t buf_sz) {
    rewind(fp);
    size_t n = fread(buf, 1, buf_sz - 1, fp);
    buf[n] = '\0';
}

static void test_arithmetic_and_unary(void) {
    TacList *tac = new_tac_list();
    append_instr(tac, TAC_OP_ASSIGN, "a", "10", NULL, 1);
    append_instr(tac, TAC_OP_ASSIGN, "b", "3", NULL, 2);
    append_instr(tac, TAC_OP_ADD, "t1", "a", "b", 3);
    append_instr(tac, TAC_OP_SUB, "t2", "a", "b", 4);
    append_instr(tac, TAC_OP_MUL, "t3", "a", "b", 5);
    append_instr(tac, TAC_OP_DIV, "t4", "a", "b", 6);
    append_instr(tac, TAC_OP_MOD, "t5", "a", "b", 7);
    append_instr(tac, TAC_OP_NEG, "t6", "t5", NULL, 8);
    append_instr(tac, TAC_OP_ASSIGN, "f", "2.5", NULL, 9);
    append_instr(tac, TAC_OP_MUL, "f2", "f", "4", 10);

    FILE *out = tmpfile();
    FILE *err = tmpfile();
    assert(out != NULL && err != NULL);

    VmConfig cfg = { 0, out, err };
    VmState *vm = vm_state_create(&cfg);
    assert(vm != NULL);

    assert(vm_execute_state(vm, tac) == VM_OK);
    assert(vm_state_get_var(vm, "t1")->as.ival == 13);
    assert(vm_state_get_var(vm, "t2")->as.ival == 7);
    assert(vm_state_get_var(vm, "t3")->as.ival == 30);
    assert(vm_state_get_var(vm, "t4")->as.ival == 3);
    assert(vm_state_get_var(vm, "t5")->as.ival == 1);
    assert(vm_state_get_var(vm, "t6")->as.ival == -1);
    assert(vm_state_get_var(vm, "f2")->kind == VM_VAL_FLOAT);
    assert(fabs(vm_state_get_var(vm, "f2")->as.fval - 10.0) < 1e-9);

    vm_state_destroy(vm);
    fclose(out);
    fclose(err);
    tac_list_free(tac);
}

static void test_relational_logical_and_branches(void) {
    TacList *tac = new_tac_list();
    append_instr(tac, TAC_OP_ASSIGN, "x", "5", NULL, 1);
    append_instr(tac, TAC_OP_LT, "t1", "x", "10", 2);
    append_instr(tac, TAC_OP_EQ, "t2", "x", "5", 3);
    append_instr(tac, TAC_OP_AND, "t3", "t1", "t2", 4);
    append_instr(tac, TAC_OP_NOT, "t4", "t3", NULL, 5);
    append_instr(tac, TAC_OP_IF_GOTO, NULL, "t4", "L_FAIL", 6);
    append_instr(tac, TAC_OP_ASSIGN, "res", "42", NULL, 7);
    append_instr(tac, TAC_OP_GOTO, "L_DONE", NULL, NULL, 8);
    append_instr(tac, TAC_OP_LABEL, "L_FAIL", NULL, NULL, 9);
    append_instr(tac, TAC_OP_ASSIGN, "res", "-1", NULL, 10);
    append_instr(tac, TAC_OP_LABEL, "L_DONE", NULL, NULL, 11);

    FILE *out = tmpfile();
    FILE *err = tmpfile();
    VmConfig cfg = { 0, out, err };
    VmState *vm = vm_state_create(&cfg);
    assert(vm_execute_state(vm, tac) == VM_OK);

    assert(vm_state_get_var(vm, "t3")->kind == VM_VAL_BOOL && vm_state_get_var(vm, "t3")->as.bval == 1);
    assert(vm_state_get_var(vm, "t4")->kind == VM_VAL_BOOL && vm_state_get_var(vm, "t4")->as.bval == 0);
    assert(vm_state_get_var(vm, "res")->as.ival == 42);

    vm_state_destroy(vm);
    fclose(out);
    fclose(err);
    tac_list_free(tac);
}

static void test_loop_and_outputs(void) {
    TacList *tac = new_tac_list();
    append_instr(tac, TAC_OP_ASSIGN, "i", "0", NULL, 1);
    append_instr(tac, TAC_OP_ASSIGN, "sum", "0", NULL, 2);
    append_instr(tac, TAC_OP_LABEL, "L_HEAD", NULL, NULL, 3);
    append_instr(tac, TAC_OP_LT, "c", "i", "4", 4);
    append_instr(tac, TAC_OP_IF_GOTO, NULL, "c", "L_BODY", 4);
    append_instr(tac, TAC_OP_GOTO, "L_END", NULL, NULL, 4);
    append_instr(tac, TAC_OP_LABEL, "L_BODY", NULL, NULL, 5);
    append_instr(tac, TAC_OP_ADD, "sum", "sum", "i", 6);
    append_instr(tac, TAC_OP_ADD, "i", "i", "1", 7);
    append_instr(tac, TAC_OP_GOTO, "L_HEAD", NULL, NULL, 8);
    append_instr(tac, TAC_OP_LABEL, "L_END", NULL, NULL, 9);
    append_instr(tac, TAC_OP_ARG, NULL, "sum", NULL, 10);
    append_instr(tac, TAC_OP_ARG, NULL, "12.5", NULL, 10);
    append_instr(tac, TAC_OP_ARG, NULL, "\"ok\\0ignored\"", NULL, 10);
    append_instr(tac, TAC_OP_PRINTF, NULL, "\"Sum=%d Avg=%f Str=%s %%\\n\"", NULL, 10);
    append_instr(tac, TAC_OP_PRINT, NULL, "\"Flag=\"", NULL, 11);
    append_instr(tac, TAC_OP_PRINTLN, NULL, "true", NULL, 11);

    FILE *out = tmpfile();
    FILE *err = tmpfile();
    VmConfig cfg = { 0, out, err };
    VmResult res;
    assert(vm_execute(tac, &cfg, &res) == VM_OK);

    char buf[512];
    read_file_content(out, buf, sizeof(buf));
    assert(strcmp(buf, "Sum=6 Avg=12.500000 Str=ok %\nFlag=true\n") == 0);

    fclose(out);
    fclose(err);
    tac_list_free(tac);
}

static void test_runtime_errors_and_step_limit(void) {
    /* 1. Division by zero with partial output preserved */
    {
        TacList *tac = new_tac_list();
        append_instr(tac, TAC_OP_PRINTLN, NULL, "\"Before error\"", NULL, 2);
        append_instr(tac, TAC_OP_DIV, "t1", "10", "0", 5);

        FILE *out = tmpfile();
        FILE *err = tmpfile();
        VmConfig cfg = { 0, out, err };
        VmResult res;
        assert(vm_execute(tac, &cfg, &res) == VM_ERR_RUNTIME);
        assert(res.error_line == 5);
        assert(strstr(res.error_message, "Division by zero") != NULL);

        char out_buf[256];
        char err_buf[256];
        read_file_content(out, out_buf, sizeof(out_buf));
        read_file_content(err, err_buf, sizeof(err_buf));
        assert(strcmp(out_buf, "Before error\n") == 0);
        assert(strstr(err_buf, "Runtime Error at line 5: Division by zero") != NULL);

        fclose(out);
        fclose(err);
        tac_list_free(tac);
    }

    /* 2. Modulo by zero */
    {
        TacList *tac = new_tac_list();
        append_instr(tac, TAC_OP_MOD, "t1", "10", "0", 9);

        FILE *out = tmpfile();
        FILE *err = tmpfile();
        VmConfig cfg = { 0, out, err };
        VmResult res;
        assert(vm_execute(tac, &cfg, &res) == VM_ERR_RUNTIME);
        assert(res.error_line == 9);
        assert(strstr(res.error_message, "Modulo by zero") != NULL);

        fclose(out);
        fclose(err);
        tac_list_free(tac);
    }

    /* 3. Uninitialized variable read */
    {
        TacList *tac = new_tac_list();
        append_instr(tac, TAC_OP_ASSIGN, "y", "unset_var", NULL, 12);

        FILE *out = tmpfile();
        FILE *err = tmpfile();
        VmConfig cfg = { 0, out, err };
        VmResult res;
        assert(vm_execute(tac, &cfg, &res) == VM_ERR_RUNTIME);
        assert(res.error_line == 12);
        assert(strstr(res.error_message, "uninitialized") != NULL);

        fclose(out);
        fclose(err);
        tac_list_free(tac);
    }

    /* 4. Infinite loop step-limit enforcement */
    {
        TacList *tac = new_tac_list();
        append_instr(tac, TAC_OP_LABEL, "L1", NULL, NULL, 15);
        append_instr(tac, TAC_OP_GOTO, "L1", NULL, NULL, 15);

        FILE *out = tmpfile();
        FILE *err = tmpfile();
        VmConfig cfg = { 100, out, err };
        VmResult res;
        assert(vm_execute(tac, &cfg, &res) == VM_ERR_STEP_LIMIT);
        assert(res.steps_executed == 100);
        assert(res.error_line == 15);

        fclose(out);
        fclose(err);
        tac_list_free(tac);
    }
}

static void test_itof_uninit_precision_and_overflow(void) {
    /* 1. TAC_OP_ITOF, %.8f precision, and TAC_OP_UNINIT slot reset */
    {
        TacList *tac = new_tac_list();
        append_instr(tac, TAC_OP_ITOF, "f", "2", NULL, 1);
        append_instr(tac, TAC_OP_DIV, "half", "f", "4", 2);
        append_instr(tac, TAC_OP_ASSIGN, "pi", "3.14159265", NULL, 3);
        append_instr(tac, TAC_OP_ASSIGN, "exact17", "1.0000000000000002", NULL, 3);
        append_instr(tac, TAC_OP_ARG, NULL, "f", NULL, 4);
        append_instr(tac, TAC_OP_ARG, NULL, "half", NULL, 4);
        append_instr(tac, TAC_OP_ARG, NULL, "pi", NULL, 4);
        append_instr(tac, TAC_OP_PRINTF, NULL, "\"f=%f half=%.2f pi=%.8f\"", NULL, 4);
        append_instr(tac, TAC_OP_UNINIT, "f", NULL, NULL, 5);
        append_instr(tac, TAC_OP_PRINTLN, NULL, "f", NULL, 6);

        FILE *out = tmpfile();
        FILE *err = tmpfile();
        VmConfig cfg = { 0, out, err };
        VmState *vm = vm_state_create(&cfg);
        assert(vm != NULL);
        assert(vm_execute_state(vm, tac) == VM_ERR_RUNTIME);
        assert(vm->result.error_line == 6);
        assert(strstr(vm->result.error_message, "uninitialized") != NULL);
        assert(vm_state_get_var(vm, "exact17")->as.fval == 1.0000000000000002);

        char out_buf[256];
        read_file_content(out, out_buf, sizeof(out_buf));
        assert(strcmp(out_buf, "f=2.000000 half=0.50 pi=3.14159265") == 0);

        vm_state_destroy(vm);
        fclose(out);
        fclose(err);
        tac_list_free(tac);
    }

    /* 2. Signed integer arithmetic overflow & INT_MIN division/modulo boundaries */
    {
        TacList *tac = new_tac_list();
        char max_str[32];
        char min_str[32];
        snprintf(max_str, sizeof(max_str), "%d", INT_MAX);
        snprintf(min_str, sizeof(min_str), "%d", INT_MIN);

        append_instr(tac, TAC_OP_ADD, "add_ovf", max_str, "1", 1);
        append_instr(tac, TAC_OP_SUB, "sub_ovf", min_str, "1", 2);
        append_instr(tac, TAC_OP_MUL, "mul_ovf", "46341", "46341", 3);
        append_instr(tac, TAC_OP_MOD, "mod_edge", min_str, "-1", 4);
        append_instr(tac, TAC_OP_NEG, "neg_edge", min_str, NULL, 5);

        FILE *out = tmpfile();
        FILE *err = tmpfile();
        VmConfig cfg = { 0, out, err };
        VmState *vm = vm_state_create(&cfg);
        assert(vm_execute_state(vm, tac) == VM_OK);
        assert(vm_state_get_var(vm, "add_ovf")->as.ival == INT_MIN);
        assert(vm_state_get_var(vm, "sub_ovf")->as.ival == INT_MAX);
        assert(vm_state_get_var(vm, "mod_edge")->as.ival == 0);
        assert(vm_state_get_var(vm, "neg_edge")->as.ival == INT_MIN);
        assert(vm_state_get_var(vm, "mul_ovf")->kind == VM_VAL_INT);
        assert(vm_state_get_var(vm, "mul_ovf")->as.ival < 0);

        vm_state_destroy(vm);
        fclose(out);
        fclose(err);
        tac_list_free(tac);

        /* INT_MIN / -1 must trap safely without crashing */
        TacList *div_tac = new_tac_list();
        append_instr(div_tac, TAC_OP_DIV, "d", min_str, "-1", 8);
        FILE *out2 = tmpfile();
        FILE *err2 = tmpfile();
        VmConfig cfg2 = { 0, out2, err2 };
        VmResult res2;
        assert(vm_execute(div_tac, &cfg2, &res2) == VM_ERR_RUNTIME);
        assert(res2.error_line == 8);
        assert(strstr(res2.error_message, "overflow") != NULL);
        fclose(out2);
        fclose(err2);
        tac_list_free(div_tac);
    }
}

int main(void) {
    test_arithmetic_and_unary();
    test_relational_logical_and_branches();
    test_loop_and_outputs();
    test_runtime_errors_and_step_limit();
    test_itof_uninit_precision_and_overflow();
    printf("All VM unit tests passed.\n");
    return 0;
}
