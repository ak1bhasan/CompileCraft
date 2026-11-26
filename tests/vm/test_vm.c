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

static FILE *make_input_stream(const char *data) {
    FILE *fp = tmpfile();
    assert(fp != NULL);
    if (data && *data) {
        size_t len = strlen(data);
        assert(fwrite(data, 1, len, fp) == len);
    }
    rewind(fp);
    return fp;
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

    VmConfig cfg = { 0, out, err, NULL };
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
    VmConfig cfg = { 0, out, err, NULL };
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
    VmConfig cfg = { 0, out, err, NULL };
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
        VmConfig cfg = { 0, out, err, NULL };
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
        VmConfig cfg = { 0, out, err, NULL };
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
        VmConfig cfg = { 0, out, err, NULL };
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
        VmConfig cfg = { 100, out, err, NULL };
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
        VmConfig cfg = { 0, out, err, NULL };
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
        VmConfig cfg = { 0, out, err, NULL };
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
        VmConfig cfg2 = { 0, out2, err2, NULL };
        VmResult res2;
        assert(vm_execute(div_tac, &cfg2, &res2) == VM_ERR_RUNTIME);
        assert(res2.error_line == 8);
        assert(strstr(res2.error_message, "overflow") != NULL);
        fclose(out2);
        fclose(err2);
        tac_list_free(div_tac);
    }
}

static VmStatus run_tac_with_input(
    const TacList *tac,
    const char *stdin_data,
    char *out_buf,
    size_t out_sz,
    char *err_buf,
    size_t err_sz,
    VmResult *out_res) {
    FILE *in = make_input_stream(stdin_data);
    FILE *out = tmpfile();
    FILE *err = tmpfile();
    assert(out != NULL && err != NULL);

    VmConfig cfg = { 0, out, err, in };
    VmResult res;
    VmStatus st = vm_execute(tac, &cfg, &res);
    if (out_buf && out_sz > 0) {
        read_file_content(out, out_buf, out_sz);
    }
    if (err_buf && err_sz > 0) {
        read_file_content(err, err_buf, err_sz);
    }
    if (out_res) {
        *out_res = res;
    }

    fclose(in);
    fclose(out);
    fclose(err);
    return st;
}

static void test_input_numeric_prefix_and_token(void) {
    /* 1. Prefix int/float delimiting + LIFO reverse pushback ("12e+x", "3.5ex") */
    {
        TacList *tac = new_tac_list();
        append_instr(tac, TAC_OP_READ_INT, "a", "prefix", NULL, 1);
        append_instr(tac, TAC_OP_SCAN_LIT, NULL, "\",\"", NULL, 1);
        append_instr(tac, TAC_OP_READ_INT, "b", "prefix", NULL, 1);
        append_instr(tac, TAC_OP_READ_FLOAT, "f1", "prefix", NULL, 2);
        append_instr(tac, TAC_OP_READ_STR, "tail1", NULL, NULL, 2);
        append_instr(tac, TAC_OP_READ_FLOAT, "f2", "prefix", NULL, 3);
        append_instr(tac, TAC_OP_READ_STR, "tail2", NULL, NULL, 3);
        append_instr(tac, TAC_OP_READ_FLOAT, "big", "prefix", NULL, 4);
        append_instr(tac, TAC_OP_READ_FLOAT, "precise", "prefix", NULL, 5);

        FILE *in = make_input_stream(
            "  +12,-34 12e+x 3.5ex 1e40 1.0000000000000002");
        FILE *out = tmpfile();
        FILE *err = tmpfile();
        VmConfig cfg = { 0, out, err, in };
        VmState *vm = vm_state_create(&cfg);
        assert(vm_execute_state(vm, tac) == VM_OK);

        assert(vm_state_get_var(vm, "a")->as.ival == 12);
        assert(vm_state_get_var(vm, "b")->as.ival == -34);
        assert(fabs(vm_state_get_var(vm, "f1")->as.fval - 12.0) < 1e-12);
        assert(strcmp(vm_state_get_var(vm, "tail1")->as.sval, "e+x") == 0);
        assert(fabs(vm_state_get_var(vm, "f2")->as.fval - 3.5) < 1e-12);
        assert(strcmp(vm_state_get_var(vm, "tail2")->as.sval, "ex") == 0);
        assert(vm_state_get_var(vm, "big")->as.fval == 1e40);
        assert(vm_state_get_var(vm, "precise")->as.fval == 1.0000000000000002);

        vm_state_destroy(vm);
        fclose(in);
        fclose(out);
        fclose(err);
        tac_list_free(tac);
    }

    /* 2. Token-mode int/float rejection vs prefix-mode acceptance & overflow checks */
    {
        TacList *t_int_tok = new_tac_list();
        append_instr(t_int_tok, TAC_OP_READ_INT, "x", "token", NULL, 7);
        VmResult res;
        assert(run_tac_with_input(t_int_tok, "12,34", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(res.error_line == 7 && strstr(res.error_message, "Invalid integer input") != NULL);
        assert(run_tac_with_input(t_int_tok, "12abc", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_int_tok, "0x10", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_int_tok, "2147483648", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(strstr(res.error_message, "overflow") != NULL);
        assert(run_tac_with_input(t_int_tok, "-2147483649", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(strstr(res.error_message, "overflow") != NULL);
        assert(run_tac_with_input(t_int_tok, "", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(strstr(res.error_message, "EOF") != NULL);
        tac_list_free(t_int_tok);

        TacList *t_int_pref = new_tac_list();
        append_instr(t_int_pref, TAC_OP_READ_INT, "x", "prefix", NULL, 8);
        assert(run_tac_with_input(t_int_pref, "+abc", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_int_pref, "2147483648", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        tac_list_free(t_int_pref);

        TacList *t_flt_tok = new_tac_list();
        append_instr(t_flt_tok, TAC_OP_READ_FLOAT, "f", "token", NULL, 9);
        assert(run_tac_with_input(t_flt_tok, "12e+x", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_flt_tok, "nan", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_flt_tok, "inf", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_flt_tok, "0x1.0p2", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_flt_tok, "1e309", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(strstr(res.error_message, "overflow") != NULL);
        assert(run_tac_with_input(t_flt_tok, "-1e309", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        tac_list_free(t_flt_tok);

        TacList *t_flt_pref = new_tac_list();
        append_instr(t_flt_pref, TAC_OP_READ_FLOAT, "f", "prefix", NULL, 10);
        assert(run_tac_with_input(t_flt_pref, ".x", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_flt_pref, "+.x", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_flt_pref, "1e309", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        tac_list_free(t_flt_pref);
    }
}

static void test_input_bool_str_and_line(void) {
    /* 1. Bool cpp (0/1 strictly) vs java (case-insensitive true/false strictly) */
    {
        TacList *t_cpp = new_tac_list();
        append_instr(t_cpp, TAC_OP_READ_BOOL, "b", "cpp", NULL, 3);
        VmResult res;
        assert(run_tac_with_input(t_cpp, "0", NULL, 0, NULL, 0, &res) == VM_OK);
        assert(run_tac_with_input(t_cpp, "1", NULL, 0, NULL, 0, &res) == VM_OK);
        assert(run_tac_with_input(t_cpp, "true", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(strstr(res.error_message, "boolalpha") != NULL);
        assert(run_tac_with_input(t_cpp, "false", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        tac_list_free(t_cpp);

        TacList *t_java = new_tac_list();
        append_instr(t_java, TAC_OP_READ_BOOL, "b", "java", NULL, 4);
        assert(run_tac_with_input(t_java, "TrUe", NULL, 0, NULL, 0, &res) == VM_OK);
        assert(run_tac_with_input(t_java, "FALSE", NULL, 0, NULL, 0, &res) == VM_OK);
        assert(run_tac_with_input(t_java, "1", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(run_tac_with_input(t_java, "0", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        tac_list_free(t_java);
    }

    /* 2. Bounded read_str capacity, token overflow, and read_line CRLF / unterminated / EOF */
    {
        TacList *tac = new_tac_list();
        append_instr(tac, TAC_OP_READ_STR, "s1", "5", NULL, 1);
        append_instr(tac, TAC_OP_READ_STR, "s2", NULL, NULL, 2);
        append_instr(tac, TAC_OP_READ_INT, "num", "token", NULL, 3);
        append_instr(tac, TAC_OP_READ_LINE, "l_after_int", NULL, NULL, 4);
        append_instr(tac, TAC_OP_READ_LINE, "l_crlf", NULL, NULL, 5);
        append_instr(tac, TAC_OP_READ_LINE, "l_empty", NULL, NULL, 6);
        append_instr(tac, TAC_OP_READ_LINE, "l_eof_tail", NULL, NULL, 7);

        FILE *in = make_input_stream("abcdefgh 42\r\nHello World\r\n\nfinal_unterminated");
        FILE *out = tmpfile();
        FILE *err = tmpfile();
        VmConfig cfg = { 0, out, err, in };
        VmState *vm = vm_state_create(&cfg);
        assert(vm_execute_state(vm, tac) == VM_OK);
        assert(strcmp(vm_state_get_var(vm, "s1")->as.sval, "abcde") == 0);
        assert(strcmp(vm_state_get_var(vm, "s2")->as.sval, "fgh") == 0);
        assert(vm_state_get_var(vm, "num")->as.ival == 42);
        assert(strcmp(vm_state_get_var(vm, "l_after_int")->as.sval, "") == 0);
        assert(strcmp(vm_state_get_var(vm, "l_crlf")->as.sval, "Hello World") == 0);
        assert(strcmp(vm_state_get_var(vm, "l_empty")->as.sval, "") == 0);
        assert(strcmp(vm_state_get_var(vm, "l_eof_tail")->as.sval, "final_unterminated") == 0);
        vm_state_destroy(vm);
        fclose(in);
        fclose(out);
        fclose(err);
        tac_list_free(tac);

        /* Immediate EOF on read_line must fail cleanly */
        TacList *t_eof = new_tac_list();
        append_instr(t_eof, TAC_OP_READ_LINE, "line", NULL, NULL, 12);
        VmResult res;
        assert(run_tac_with_input(t_eof, "", NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(res.error_line == 12 && strstr(res.error_message, "EOF") != NULL);
        tac_list_free(t_eof);

        /* Unbounded token exceeding VM_MAX_INPUT_TOKEN_LEN and line exceeding VM_MAX_INPUT_LINE_LEN */
        char *huge_tok = (char *)malloc(VM_MAX_INPUT_TOKEN_LEN + 10);
        assert(huge_tok != NULL);
        memset(huge_tok, 'a', VM_MAX_INPUT_TOKEN_LEN + 5);
        huge_tok[VM_MAX_INPUT_TOKEN_LEN + 5] = '\0';

        TacList *t_big_str = new_tac_list();
        append_instr(t_big_str, TAC_OP_READ_STR, "w", NULL, NULL, 15);
        assert(run_tac_with_input(t_big_str, huge_tok, NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(strstr(res.error_message, "maximum token length") != NULL);
        tac_list_free(t_big_str);
        free(huge_tok);

        char *huge_line = (char *)malloc(VM_MAX_INPUT_LINE_LEN + 10);
        assert(huge_line != NULL);
        memset(huge_line, 'z', VM_MAX_INPUT_LINE_LEN + 5);
        huge_line[VM_MAX_INPUT_LINE_LEN + 5] = '\0';

        TacList *t_big_line = new_tac_list();
        append_instr(t_big_line, TAC_OP_READ_LINE, "l", NULL, NULL, 16);
        assert(run_tac_with_input(t_big_line, huge_line, NULL, 0, NULL, 0, &res) == VM_ERR_RUNTIME);
        assert(strstr(res.error_message, "Input line exceeds maximum length") != NULL);

        /* Exact VM_MAX_INPUT_LINE_LEN succeeds cleanly */
        huge_line[VM_MAX_INPUT_LINE_LEN] = '\n';
        huge_line[VM_MAX_INPUT_LINE_LEN + 1] = '\0';
        assert(run_tac_with_input(t_big_line, huge_line, NULL, 0, NULL, 0, &res) == VM_OK);
        tac_list_free(t_big_line);
        free(huge_line);

        /* Explicit TAC_OP_SCAN_WS preserves first non-whitespace char across 0+ ws */
        TacList *t_ws = new_tac_list();
        append_instr(t_ws, TAC_OP_SCAN_WS, NULL, NULL, NULL, 17);
        append_instr(t_ws, TAC_OP_SCAN_LIT, NULL, "\":\"", NULL, 17);
        append_instr(t_ws, TAC_OP_SCAN_WS, NULL, NULL, NULL, 17);
        append_instr(t_ws, TAC_OP_READ_INT, "k", "prefix", NULL, 17);
        assert(run_tac_with_input(t_ws, "   \t\r\n:  99", NULL, 0, NULL, 0, &res) == VM_OK);
        assert(run_tac_with_input(t_ws, ":99", NULL, 0, NULL, 0, &res) == VM_OK);
        tac_list_free(t_ws);
    }
}

static void test_ast_tac_vm_input_pipelines(void) {
    /* 1. C AST (scanf with %%, ws, literal, %Ns) -> TAC -> VM */
    {
        AstList stmts = ast_list_empty();
        assert(ast_list_append(&stmts, ast_var_decl(AST_TYPE_INT, ast_identifier(dup_str("a"), 1, 1), NULL, 1, 1)));
        assert(ast_list_append(&stmts, ast_var_decl(AST_TYPE_FLOAT, ast_identifier(dup_str("f"), 2, 1), NULL, 2, 1)));
        assert(ast_list_append(&stmts, ast_var_decl_array(AST_TYPE_STRING, ast_identifier(dup_str("s"), 3, 1), 10, NULL, 3, 1)));

        AstList sc = ast_list_empty();
        assert(ast_list_append(&sc, ast_literal_string(dup_str("\"%% %d,%f,%5s\""), 4, 1)));
        assert(ast_list_append(&sc, ast_addr_of(ast_identifier(dup_str("a"), 4, 1), 4, 1)));
        assert(ast_list_append(&sc, ast_addr_of(ast_identifier(dup_str("f"), 4, 1), 4, 1)));
        assert(ast_list_append(&sc, ast_identifier(dup_str("s"), 4, 1)));
        assert(ast_list_append(&stmts, ast_input(sc, AST_INPUT_SCANF, 4, 1)));

        AstList pf = ast_list_empty();
        assert(ast_list_append(&pf, ast_literal_string(dup_str("\"%d|%.2f|%s\""), 5, 1)));
        assert(ast_list_append(&pf, ast_identifier(dup_str("a"), 5, 1)));
        assert(ast_list_append(&pf, ast_identifier(dup_str("f"), 5, 1)));
        assert(ast_list_append(&pf, ast_identifier(dup_str("s"), 5, 1)));
        assert(ast_list_append(&stmts, ast_output_with_mode(pf, AST_OUTPUT_PRINTF, 0, 5, 1)));

        AstNode *prog = ast_program(stmts, 1, 1);
        TacList *tac = tac_generate_program(prog);
        assert(tac != NULL);

        char out[256];
        char err[256];
        VmResult res;
        assert(run_tac_with_input(tac, "%\t 7,2.5,abcdef", out, sizeof(out), err, sizeof(err), &res) == VM_OK);
        assert(strcmp(out, "7|2.50|abcde") == 0);

        /* Failed scan_lit after partial output preserves stdout */
        AstList pf_pre = ast_list_empty();
        assert(ast_list_append(&pf_pre, ast_literal_string(dup_str("\"Prompt:\""), 1, 1)));
        TacList *tac2 = new_tac_list();
        append_instr(tac2, TAC_OP_PRINT, NULL, "\"Prompt:\"", NULL, 1);
        append_instr(tac2, TAC_OP_READ_INT, "x", "prefix", NULL, 2);
        append_instr(tac2, TAC_OP_SCAN_LIT, NULL, "\",\"", NULL, 2);
        append_instr(tac2, TAC_OP_READ_INT, "y", "prefix", NULL, 2);
        ast_free(pf_pre.head);
        assert(run_tac_with_input(tac2, "10;20", out, sizeof(out), err, sizeof(err), &res) == VM_ERR_RUNTIME);
        assert(strcmp(out, "Prompt:") == 0);
        assert(res.error_line == 2 && strstr(err, "Input format mismatch") != NULL);
        tac_list_free(tac2);

        tac_list_free(tac);
        ast_free(prog);
    }

    /* 2. C++ AST (chained cin >> into loop accumulator) -> TAC -> VM */
    {
        AstList stmts = ast_list_empty();
        assert(ast_list_append(&stmts, ast_var_decl(AST_TYPE_INT, ast_identifier(dup_str("n"), 1, 1), NULL, 1, 1)));
        assert(ast_list_append(&stmts, ast_var_decl(AST_TYPE_BOOL, ast_identifier(dup_str("ok"), 2, 1), NULL, 2, 1)));
        assert(ast_list_append(&stmts, ast_var_decl(AST_TYPE_INT, ast_identifier(dup_str("sum"), 3, 1), ast_literal_int(0, 3, 1), 3, 1)));

        AstList cin1 = ast_list_empty();
        assert(ast_list_append(&cin1, ast_identifier(dup_str("n"), 4, 1)));
        assert(ast_list_append(&cin1, ast_identifier(dup_str("ok"), 4, 1)));
        assert(ast_list_append(&stmts, ast_input(cin1, AST_INPUT_CIN, 4, 1)));

        /* while (n > 0) { cin >> x; sum = sum + x; n = n - 1; } */
        AstList body = ast_list_empty();
        assert(ast_list_append(&body, ast_var_decl(AST_TYPE_INT, ast_identifier(dup_str("x"), 6, 1), NULL, 6, 1)));
        AstList cin_loop = ast_list_empty();
        assert(ast_list_append(&cin_loop, ast_identifier(dup_str("x"), 7, 1)));
        assert(ast_list_append(&body, ast_input(cin_loop, AST_INPUT_CIN, 7, 1)));
        assert(ast_list_append(
            &body,
            ast_assign(ast_identifier(dup_str("sum"), 8, 1),
                       ast_binary(AST_OP_ADD, ast_identifier(dup_str("sum"), 8, 1),
                                  ast_identifier(dup_str("x"), 8, 1), 8, 1),
                       8, 1)));
        assert(ast_list_append(
            &body,
            ast_assign(ast_identifier(dup_str("n"), 9, 1),
                       ast_binary(AST_OP_SUB, ast_identifier(dup_str("n"), 9, 1),
                                  ast_literal_int(1, 9, 1), 9, 1),
                       9, 1)));

        AstNode *cond = ast_binary(AST_OP_GT, ast_identifier(dup_str("n"), 5, 1), ast_literal_int(0, 5, 1), 5, 1);
        assert(ast_list_append(&stmts, ast_while(cond, ast_block(body, 5, 1), 5, 1)));

        AstList cout_items = ast_list_empty();
        assert(ast_list_append(&cout_items, ast_identifier(dup_str("ok"), 10, 1)));
        assert(ast_list_append(&cout_items, ast_literal_string(dup_str("\":\""), 10, 1)));
        assert(ast_list_append(&cout_items, ast_identifier(dup_str("sum"), 10, 1)));
        assert(ast_list_append(&stmts, ast_output(cout_items, 1, 10, 1)));

        AstNode *prog = ast_program(stmts, 1, 1);
        TacList *tac = tac_generate_program(prog);
        assert(tac != NULL);

        char out[256];
        VmResult res;
        assert(run_tac_with_input(tac, "3 1 10 20 30", out, sizeof(out), NULL, 0, &res) == VM_OK);
        assert(strcmp(out, "true:60\n") == 0);

        tac_list_free(tac);
        ast_free(prog);
    }

    /* 3. Java AST (Scanner, nextInt, discard nextLine, nextLine, nextBoolean, String concat) */
    {
        AstList stmts = ast_list_empty();
        assert(ast_list_append(
            &stmts,
            ast_var_decl(AST_TYPE_SCANNER, ast_identifier(dup_str("sc"), 1, 1),
                         ast_scanner_new(dup_str("Scanner"), dup_str("System.in"), 1, 1), 1, 1)));
        assert(ast_list_append(
            &stmts,
            ast_var_decl(AST_TYPE_INT, ast_identifier(dup_str("age"), 2, 1),
                         ast_input_call(ast_identifier(dup_str("sc"), 2, 1), dup_str("nextInt"), 2, 1),
                         2, 1)));
        assert(ast_list_append(
            &stmts,
            ast_expr_stmt(ast_input_call(ast_identifier(dup_str("sc"), 3, 1), dup_str("nextLine"), 3, 1), 3, 1)));
        assert(ast_list_append(
            &stmts,
            ast_var_decl(AST_TYPE_STRING, ast_identifier(dup_str("name"), 4, 1),
                         ast_input_call(ast_identifier(dup_str("sc"), 4, 1), dup_str("nextLine"), 4, 1),
                         4, 1)));
        assert(ast_list_append(
            &stmts,
            ast_var_decl(AST_TYPE_BOOL, ast_identifier(dup_str("active"), 5, 1),
                         ast_input_call(ast_identifier(dup_str("sc"), 5, 1), dup_str("nextBoolean"), 5, 1),
                         5, 1)));

        AstList pr = ast_list_empty();
        AstNode *c1 = ast_binary(AST_OP_ADD, ast_identifier(dup_str("name"), 6, 1), ast_literal_string(dup_str("\"=\""), 6, 1), 6, 1);
        AstNode *c2 = ast_binary(AST_OP_ADD, c1, ast_identifier(dup_str("age"), 6, 1), 6, 1);
        AstNode *c3 = ast_binary(AST_OP_ADD, c2, ast_literal_string(dup_str("\",\""), 6, 1), 6, 1);
        AstNode *c4 = ast_binary(AST_OP_ADD, c3, ast_identifier(dup_str("active"), 6, 1), 6, 1);
        assert(ast_list_append(&pr, c4));
        assert(ast_list_append(&stmts, ast_output_with_mode(pr, AST_OUTPUT_CONCAT, 1, 6, 1)));

        AstNode *prog = ast_program(stmts, 1, 1);
        TacList *tac = tac_generate_program(prog);
        assert(tac != NULL);

        char out[256];
        VmResult res;
        assert(run_tac_with_input(tac, "21\nAda Lovelace\ntrue\n", out, sizeof(out), NULL, 0, &res) == VM_OK);
        assert(strcmp(out, "Ada Lovelace=21,true\n") == 0);

        tac_list_free(tac);
        ast_free(prog);
    }
}

int main(void) {
    test_arithmetic_and_unary();
    test_relational_logical_and_branches();
    test_loop_and_outputs();
    test_runtime_errors_and_step_limit();
    test_itof_uninit_precision_and_overflow();
    test_input_numeric_prefix_and_token();
    test_input_bool_str_and_line();
    test_ast_tac_vm_input_pipelines();
    printf("All VM unit tests passed.\n");
    return 0;
}
