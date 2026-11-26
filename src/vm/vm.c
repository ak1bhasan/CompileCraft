/* ==============================================================================
 * CompileCraft - Shared TAC Virtual Machine Execution Engine (Milestone 15)
 *
 * Implements instruction dispatch, variable/temporary storage, label jump
 * resolution, print/println/printf output formatting, and bounded-step guards.
 * ============================================================================== */

#include "vm.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <math.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static int wrap_u32_to_i32(uint32_t u) {
    if (u <= (uint32_t)INT_MAX) {
        return (int)u;
    }
    return -(int)(UINT32_MAX - u) - 1;
}

static char *vm_strdup_safe(const char *s) {
    if (!s) {
        return NULL;
    }
    size_t len = strlen(s);
    char *copy = (char *)malloc(len + 1);
    if (!copy) {
        return NULL;
    }
    memcpy(copy, s, len + 1);
    return copy;
}

static void clear_args(VmState *state) {
    if (!state) {
        return;
    }
    for (size_t i = 0; i < state->arg_count; i++) {
        vm_value_free(&state->args[i]);
    }
    state->arg_count = 0;
}

static void clear_labels(VmState *state) {
    if (!state) {
        return;
    }
    for (size_t i = 0; i < state->label_count; i++) {
        free(state->labels[i].name);
    }
    state->label_count = 0;
}

static VmStatus fail_vm(VmState *state, VmStatus status, int line, const char *fmt, ...) {
    if (state->out) {
        fflush(state->out);
    }

    state->result.status = status;
    state->result.steps_executed = state->steps_executed;
    state->result.error_line = (line > 0) ? line : 0;

    va_list args;
    va_start(args, fmt);
    vsnprintf(state->result.error_message, sizeof(state->result.error_message), fmt, args);
    va_end(args);

    if (state->err) {
        if (state->result.error_line > 0) {
            fprintf(state->err, "Runtime Error at line %d: %s\n",
                    state->result.error_line, state->result.error_message);
        } else {
            fprintf(state->err, "Runtime Error: %s\n", state->result.error_message);
        }
        fflush(state->err);
    }

    return status;
}

VmState *vm_state_create(const VmConfig *config) {
    VmState *state = (VmState *)calloc(1, sizeof(VmState));
    if (!state) {
        return NULL;
    }

    state->max_steps = (config && config->max_steps > 0)
                           ? config->max_steps
                           : (size_t)VM_DEFAULT_MAX_STEPS;
    state->out = (config && config->out) ? config->out : stdout;
    state->err = (config && config->err) ? config->err : stderr;
    state->in = (config && config->in) ? config->in : stdin;
    state->pushback_len = 0;
    state->result.status = VM_OK;
    return state;
}

void vm_state_destroy(VmState *state) {
    if (!state) {
        return;
    }

    for (size_t i = 0; i < state->var_count; i++) {
        free(state->vars[i].name);
        vm_value_free(&state->vars[i].value);
    }
    free(state->vars);

    clear_args(state);
    free(state->args);

    clear_labels(state);
    free(state->labels);

    free(state);
}

static VmVarEntry *find_var_entry(const VmState *state, const char *name) {
    if (!state || !name) {
        return NULL;
    }
    for (size_t i = 0; i < state->var_count; i++) {
        if (strcmp(state->vars[i].name, name) == 0) {
            return &state->vars[i];
        }
    }
    return NULL;
}

const VmValue *vm_state_get_var(const VmState *state, const char *name) {
    const VmVarEntry *entry = find_var_entry(state, name);
    return entry ? &entry->value : NULL;
}

static int set_var(VmState *state, const char *name, const VmValue *val) {
    if (!state || !name || !val) {
        return 0;
    }

    VmValue copy = vm_value_uninit();
    if (!vm_value_copy(&copy, val)) {
        return 0;
    }

    VmVarEntry *existing = find_var_entry(state, name);
    if (existing) {
        vm_value_free(&existing->value);
        existing->value = copy;
        return 1;
    }

    if (state->var_count == state->var_capacity) {
        size_t next_cap = state->var_capacity == 0 ? 16 : state->var_capacity * 2;
        VmVarEntry *grown = (VmVarEntry *)realloc(state->vars, next_cap * sizeof(VmVarEntry));
        if (!grown) {
            vm_value_free(&copy);
            return 0;
        }
        state->vars = grown;
        state->var_capacity = next_cap;
    }

    char *name_copy = vm_strdup_safe(name);
    if (!name_copy) {
        vm_value_free(&copy);
        return 0;
    }

    state->vars[state->var_count].name = name_copy;
    state->vars[state->var_count].value = copy;
    state->var_count++;
    return 1;
}

static int push_arg(VmState *state, const VmValue *val) {
    if (!state || !val) {
        return 0;
    }
    if (state->arg_count == state->arg_capacity) {
        size_t next_cap = state->arg_capacity == 0 ? 8 : state->arg_capacity * 2;
        VmValue *grown = (VmValue *)realloc(state->args, next_cap * sizeof(VmValue));
        if (!grown) {
            return 0;
        }
        state->args = grown;
        state->arg_capacity = next_cap;
    }
    if (!vm_value_copy(&state->args[state->arg_count], val)) {
        return 0;
    }
    state->arg_count++;
    return 1;
}

static int find_label_pc(const VmState *state, const char *name, size_t *out_pc) {
    if (!state || !name || !out_pc) {
        return 0;
    }
    for (size_t i = 0; i < state->label_count; i++) {
        if (strcmp(state->labels[i].name, name) == 0) {
            *out_pc = state->labels[i].pc;
            return 1;
        }
    }
    return 0;
}

static VmStatus index_labels(VmState *state, TacInstr *const *code, size_t count) {
    clear_labels(state);

    for (size_t i = 0; i < count; i++) {
        const TacInstr *instr = code[i];
        if (instr->opcode != TAC_OP_LABEL) {
            continue;
        }
        if (!instr->dest || instr->dest[0] == '\0') {
            return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Empty TAC label");
        }
        size_t existing_pc = 0;
        if (find_label_pc(state, instr->dest, &existing_pc)) {
            return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                           "Duplicate TAC label '%s'", instr->dest);
        }

        if (state->label_count == state->label_capacity) {
            size_t next_cap = state->label_capacity == 0 ? 16 : state->label_capacity * 2;
            VmLabelEntry *grown =
                (VmLabelEntry *)realloc(state->labels, next_cap * sizeof(VmLabelEntry));
            if (!grown) {
                return fail_vm(state, VM_ERR_OOM, instr->line, "Out of memory indexing labels");
            }
            state->labels = grown;
            state->label_capacity = next_cap;
        }

        char *name_copy = vm_strdup_safe(instr->dest);
        if (!name_copy) {
            return fail_vm(state, VM_ERR_OOM, instr->line, "Out of memory storing label");
        }
        state->labels[state->label_count].name = name_copy;
        state->labels[state->label_count].pc = i;
        state->label_count++;
    }

    return VM_OK;
}

static VmStatus resolve_operand(
    VmState *state,
    const char *operand,
    int line,
    VmValue *out) {
    if (!operand || operand[0] == '\0') {
        return fail_vm(state, VM_ERR_RUNTIME, line, "Missing TAC operand");
    }

    int matched = 0;
    if (!vm_value_parse_literal(operand, out, &matched)) {
        return fail_vm(state, VM_ERR_OOM, line, "Failed parsing literal '%s'", operand);
    }
    if (matched) {
        return VM_OK;
    }

    const VmValue *var = vm_state_get_var(state, operand);
    if (!var || var->kind == VM_VAL_UNINIT) {
        const char *sep = strchr(operand, '$');
        int disp_len = sep ? (int)(sep - operand) : (int)strlen(operand);
        return fail_vm(state, VM_ERR_RUNTIME, line,
                       "Read of uninitialized variable '%.*s'", disp_len, operand);
    }

    if (!vm_value_copy(out, var)) {
        return fail_vm(state, VM_ERR_OOM, line, "Out of memory copying '%s'", operand);
    }
    return VM_OK;
}

static VmStatus eval_arithmetic(
    VmState *state,
    const TacInstr *instr,
    const VmValue *lhs,
    const VmValue *rhs,
    VmValue *out) {
    if (!vm_value_is_numeric(lhs) || !vm_value_is_numeric(rhs)) {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                       "Arithmetic operator requires numeric operands (got %s and %s)",
                       vm_value_kind_name(lhs->kind), vm_value_kind_name(rhs->kind));
    }

    if (instr->opcode == TAC_OP_MOD) {
        if (lhs->kind != VM_VAL_INT || rhs->kind != VM_VAL_INT) {
            return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                           "Modulo operator requires int operands (got %s and %s)",
                           vm_value_kind_name(lhs->kind), vm_value_kind_name(rhs->kind));
        }
        if (rhs->as.ival == 0) {
            return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Modulo by zero");
        }
        if (lhs->as.ival == INT_MIN && rhs->as.ival == -1) {
            *out = vm_value_int(0);
            return VM_OK;
        }
        *out = vm_value_int(lhs->as.ival % rhs->as.ival);
        return VM_OK;
    }

    if (lhs->kind == VM_VAL_INT && rhs->kind == VM_VAL_INT) {
        int a = lhs->as.ival;
        int b = rhs->as.ival;
        uint32_t ua = (uint32_t)a;
        uint32_t ub = (uint32_t)b;
        switch (instr->opcode) {
            case TAC_OP_ADD:
                *out = vm_value_int(wrap_u32_to_i32(ua + ub));
                return VM_OK;
            case TAC_OP_SUB:
                *out = vm_value_int(wrap_u32_to_i32(ua - ub));
                return VM_OK;
            case TAC_OP_MUL:
                *out = vm_value_int(wrap_u32_to_i32(ua * ub));
                return VM_OK;
            case TAC_OP_DIV:
                if (b == 0) {
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Division by zero");
                }
                if (a == INT_MIN && b == -1) {
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                   "Signed integer overflow in division");
                }
                *out = vm_value_int(a / b);
                return VM_OK;
            default:
                break;
        }
    }

    double a = vm_value_as_double(lhs);
    double b = vm_value_as_double(rhs);
    switch (instr->opcode) {
        case TAC_OP_ADD: *out = vm_value_float(a + b); return VM_OK;
        case TAC_OP_SUB: *out = vm_value_float(a - b); return VM_OK;
        case TAC_OP_MUL: *out = vm_value_float(a * b); return VM_OK;
        case TAC_OP_DIV:
            if (b == 0.0) {
                return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Division by zero");
            }
            *out = vm_value_float(a / b);
            return VM_OK;
        default:
            return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Unsupported arithmetic opcode");
    }
}

static VmStatus eval_comparison(
    VmState *state,
    const TacInstr *instr,
    const VmValue *lhs,
    const VmValue *rhs,
    VmValue *out) {
    if (instr->opcode == TAC_OP_EQ || instr->opcode == TAC_OP_NE) {
        int eq = 0;
        if (vm_value_is_numeric(lhs) && vm_value_is_numeric(rhs)) {
            if (lhs->kind == VM_VAL_INT && rhs->kind == VM_VAL_INT) {
                eq = (lhs->as.ival == rhs->as.ival);
            } else {
                eq = (vm_value_as_double(lhs) == vm_value_as_double(rhs));
            }
        } else if (lhs->kind == VM_VAL_BOOL && rhs->kind == VM_VAL_BOOL) {
            eq = ((lhs->as.bval != 0) == (rhs->as.bval != 0));
        } else if (lhs->kind == VM_VAL_STRING && rhs->kind == VM_VAL_STRING) {
            eq = (strcmp(lhs->as.sval, rhs->as.sval) == 0);
        } else {
            return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                           "Incompatible types for equality comparison (%s and %s)",
                           vm_value_kind_name(lhs->kind), vm_value_kind_name(rhs->kind));
        }
        *out = vm_value_bool(instr->opcode == TAC_OP_EQ ? eq : !eq);
        return VM_OK;
    }

    if (!vm_value_is_numeric(lhs) || !vm_value_is_numeric(rhs)) {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                       "Relational operator requires numeric operands (got %s and %s)",
                       vm_value_kind_name(lhs->kind), vm_value_kind_name(rhs->kind));
    }

    double a = vm_value_as_double(lhs);
    double b = vm_value_as_double(rhs);
    int res = 0;
    switch (instr->opcode) {
        case TAC_OP_LT: res = (a < b); break;
        case TAC_OP_GT: res = (a > b); break;
        case TAC_OP_LE: res = (a <= b); break;
        case TAC_OP_GE: res = (a >= b); break;
        default: break;
    }
    *out = vm_value_bool(res);
    return VM_OK;
}

static void print_vm_value(FILE *out, const VmValue *val) {
    if (!out || !val) {
        return;
    }
    switch (val->kind) {
        case VM_VAL_INT:
            fprintf(out, "%d", val->as.ival);
            break;
        case VM_VAL_FLOAT:
            fprintf(out, "%g", val->as.fval);
            break;
        case VM_VAL_BOOL:
            fputs(val->as.bval ? "true" : "false", out);
            break;
        case VM_VAL_STRING:
            fputs(val->as.sval ? val->as.sval : "", out);
            break;
        default:
            break;
    }
}

static VmStatus exec_printf(VmState *state, const TacInstr *instr) {
    VmValue fmt_val = vm_value_uninit();
    VmStatus st = resolve_operand(state, instr->src1, instr->line, &fmt_val);
    if (st != VM_OK) {
        clear_args(state);
        return st;
    }
    if (fmt_val.kind != VM_VAL_STRING) {
        vm_value_free(&fmt_val);
        clear_args(state);
        return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                       "printf expects string format (got %s)",
                       vm_value_kind_name(fmt_val.kind));
    }

    const char *p = fmt_val.as.sval ? fmt_val.as.sval : "";
    size_t arg_idx = 0;

    while (*p != '\0') {
        if (*p != '%') {
            fputc(*p, state->out);
            p++;
            continue;
        }

        p++;
        if (*p == '\0') {
            vm_value_free(&fmt_val);
            clear_args(state);
            return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                           "Incomplete '%%' conversion specifier in printf");
        }
        if (*p == '%') {
            fputc('%', state->out);
            p++;
            continue;
        }

        char spec = *p++;
        int prec = -1;
        if (spec == '.') {
            int has_digits = 0;
            int val = 0;
            while (*p != '\0' && isdigit((unsigned char)*p)) {
                has_digits = 1;
                if (val <= 20) {
                    val = val * 10 + (*p - '0');
                }
                p++;
            }
            if (!has_digits || *p != 'f' || val > 20) {
                vm_value_free(&fmt_val);
                clear_args(state);
                return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                               "Unsupported printf precision specifier");
            }
            p++;
            spec = 'f';
            prec = val;
        }
        if (spec != 'd' && spec != 'f' && spec != 's') {
            vm_value_free(&fmt_val);
            clear_args(state);
            return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                           "Unsupported printf format specifier '%%%c'", spec);
        }

        if (arg_idx >= state->arg_count) {
            vm_value_free(&fmt_val);
            clear_args(state);
            return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                           "Missing argument for printf specifier '%%%c'", spec);
        }

        const VmValue *arg = &state->args[arg_idx++];
        if (spec == 'd') {
            if (arg->kind != VM_VAL_INT) {
                VmValueKind got = arg->kind;
                vm_value_free(&fmt_val);
                clear_args(state);
                return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                               "printf '%%d' expects int, got %s", vm_value_kind_name(got));
            }
            fprintf(state->out, "%d", arg->as.ival);
        } else if (spec == 'f') {
            if (arg->kind != VM_VAL_FLOAT) {
                VmValueKind got = arg->kind;
                vm_value_free(&fmt_val);
                clear_args(state);
                return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                               "printf '%%f' expects float, got %s", vm_value_kind_name(got));
            }
            if (prec >= 0) {
                fprintf(state->out, "%.*f", prec, arg->as.fval);
            } else {
                fprintf(state->out, "%f", arg->as.fval);
            }
        } else {
            if (arg->kind != VM_VAL_STRING) {
                VmValueKind got = arg->kind;
                vm_value_free(&fmt_val);
                clear_args(state);
                return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                               "printf '%%s' expects string, got %s", vm_value_kind_name(got));
            }
            fputs(arg->as.sval ? arg->as.sval : "", state->out);
        }
    }

    if (arg_idx != state->arg_count) {
        vm_value_free(&fmt_val);
        clear_args(state);
        return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                       "Too many arguments passed to printf");
    }

    fflush(state->out);
    vm_value_free(&fmt_val);
    clear_args(state);
    return VM_OK;
}

typedef struct VmCharBuf {
    char *data;
    size_t len;
    size_t cap;
} VmCharBuf;

static int vm_buf_append(VmCharBuf *b, char c, size_t max_len) {
    if (b->len >= max_len) {
        return -1;
    }
    if (b->len + 2 > b->cap) {
        size_t next_cap = (b->cap == 0) ? 64 : (b->cap * 2);
        if (next_cap > max_len + 1) {
            next_cap = max_len + 1;
        }
        char *grown = (char *)realloc(b->data, next_cap);
        if (!grown) {
            return -2;
        }
        b->data = grown;
        b->cap = next_cap;
    }
    b->data[b->len++] = c;
    b->data[b->len] = '\0';
    return 1;
}

static int vm_getc(VmState *state) {
    if (!state) {
        return EOF;
    }
    if (state->pushback_len > 0) {
        return state->pushback[--state->pushback_len];
    }
    if (!state->in) {
        return EOF;
    }
    return fgetc(state->in);
}

static int vm_ungetc(VmState *state, int ch) {
    if (!state || ch == EOF) {
        return 1;
    }
    if (state->pushback_len >= VM_PUSHBACK_CAP) {
        return 0;
    }
    state->pushback[state->pushback_len++] = ch;
    return 1;
}

static int vm_unget_slice_reverse(VmState *state, const char *buf, size_t len) {
    for (size_t i = len; i > 0; i--) {
        if (!vm_ungetc(state, (unsigned char)buf[i - 1])) {
            return 0;
        }
    }
    return 1;
}

static int eq_nocase_vm(const char *a, const char *b) {
    while (*a && *b) {
        if (tolower((unsigned char)*a) != tolower((unsigned char)*b)) {
            return 0;
        }
        a++;
        b++;
    }
    return *a == '\0' && *b == '\0';
}

static VmStatus fail_input_eof(VmState *state, int line, const char *what) {
    if (state->in && ferror(state->in)) {
        return fail_vm(state, VM_ERR_RUNTIME, line, "Input stream read error");
    }
    return fail_vm(state, VM_ERR_RUNTIME, line,
                   "Unexpected end of input (EOF) while reading %s", what);
}

static int vm_skip_leading_ws(VmState *state, int *out_ch) {
    if (state->out) {
        fflush(state->out);
    }
    int ch = vm_getc(state);
    while (ch != EOF && isspace((unsigned char)ch)) {
        ch = vm_getc(state);
    }
    *out_ch = ch;
    return (ch != EOF);
}

static VmStatus read_ws_delimited_token(
    VmState *state,
    int line,
    int first_ch,
    size_t max_len,
    const char *limit_label,
    VmCharBuf *out_buf) {
    int ch = first_ch;
    while (ch != EOF && !isspace((unsigned char)ch)) {
        int rc = vm_buf_append(out_buf, (char)ch, max_len);
        if (rc == -1) {
            return fail_vm(state, VM_ERR_RUNTIME, line,
                           "%s exceeds maximum token length (%lu bytes)",
                           limit_label, (unsigned long)max_len);
        }
        if (rc == -2) {
            return fail_vm(state, VM_ERR_OOM, line, "Out of memory reading input");
        }
        ch = vm_getc(state);
    }
    if (ch == EOF && state->in && ferror(state->in)) {
        return fail_vm(state, VM_ERR_RUNTIME, line, "Input stream read error");
    }
    if (ch != EOF && !vm_ungetc(state, ch)) {
        return fail_vm(state, VM_ERR_RUNTIME, line, "Input pushback buffer overflow");
    }
    return VM_OK;
}

static int is_valid_int_token(const char *s) {
    if (!s || *s == '\0') {
        return 0;
    }
    if (*s == '+' || *s == '-') {
        s++;
    }
    if (!isdigit((unsigned char)*s)) {
        return 0;
    }
    while (*s) {
        if (!isdigit((unsigned char)*s)) {
            return 0;
        }
        s++;
    }
    return 1;
}

static int is_valid_decimal_float_token(const char *s) {
    if (!s || *s == '\0') {
        return 0;
    }
    if (*s == '+' || *s == '-') {
        s++;
    }
    size_t digits_before = 0;
    while (isdigit((unsigned char)*s)) {
        digits_before++;
        s++;
    }
    size_t digits_after = 0;
    if (*s == '.') {
        s++;
        while (isdigit((unsigned char)*s)) {
            digits_after++;
            s++;
        }
    }
    if (digits_before + digits_after == 0) {
        return 0;
    }
    if (*s == 'e' || *s == 'E') {
        s++;
        if (*s == '+' || *s == '-') {
            s++;
        }
        size_t exp_digits = 0;
        while (isdigit((unsigned char)*s)) {
            exp_digits++;
            s++;
        }
        if (exp_digits == 0) {
            return 0;
        }
    }
    return *s == '\0';
}

static VmStatus exec_read_int(VmState *state, const TacInstr *instr) {
    if (!instr->dest || instr->dest[0] == '\0') {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing integer input target");
    }
    const char *mode = instr->src1 ? instr->src1 : "token";
    int is_prefix = 0;
    if (strcmp(mode, "prefix") == 0) {
        is_prefix = 1;
    } else if (strcmp(mode, "token") != 0) {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                       "Unsupported integer input mode '%s'", mode);
    }

    int ch = EOF;
    if (!vm_skip_leading_ws(state, &ch)) {
        return fail_input_eof(state, instr->line, "int");
    }

    VmCharBuf buf = { NULL, 0, 0 };
    if (is_prefix) {
        char sign_ch = 0;
        if (ch == '+' || ch == '-') {
            sign_ch = (char)ch;
            if (vm_buf_append(&buf, sign_ch, VM_MAX_INPUT_TOKEN_LEN) < 0) {
                free(buf.data);
                return fail_vm(state, VM_ERR_OOM, instr->line, "Out of memory reading int");
            }
            ch = vm_getc(state);
            if (ch == EOF || !isdigit((unsigned char)ch)) {
                int read_err = (ch == EOF && state->in && ferror(state->in));
                if (ch != EOF) {
                    vm_ungetc(state, ch);
                }
                vm_ungetc(state, (unsigned char)sign_ch);
                free(buf.data);
                if (read_err) {
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input stream read error");
                }
                return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Invalid integer input");
            }
        } else if (!isdigit((unsigned char)ch)) {
            vm_ungetc(state, ch);
            return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Invalid integer input");
        }

        while (ch != EOF && isdigit((unsigned char)ch)) {
            int rc = vm_buf_append(&buf, (char)ch, VM_MAX_INPUT_TOKEN_LEN);
            if (rc == -1) {
                free(buf.data);
                return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                               "Integer input exceeds maximum token length (%d bytes)",
                               VM_MAX_INPUT_TOKEN_LEN);
            }
            if (rc == -2) {
                free(buf.data);
                return fail_vm(state, VM_ERR_OOM, instr->line, "Out of memory reading int");
            }
            ch = vm_getc(state);
        }
        if (ch == EOF && state->in && ferror(state->in)) {
            free(buf.data);
            return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input stream read error");
        }
        if (ch != EOF && !vm_ungetc(state, ch)) {
            free(buf.data);
            return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input pushback buffer overflow");
        }
    } else {
        VmStatus st = read_ws_delimited_token(
            state, instr->line, ch, VM_MAX_INPUT_TOKEN_LEN, "Integer input", &buf);
        if (st != VM_OK) {
            free(buf.data);
            return st;
        }
        if (!is_valid_int_token(buf.data)) {
            VmStatus err_st = fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                      "Invalid integer input '%s'", buf.data ? buf.data : "");
            free(buf.data);
            return err_st;
        }
    }

    char *endptr = NULL;
    errno = 0;
    long lval = strtol(buf.data, &endptr, 10);
    if (endptr == buf.data || *endptr != '\0') {
        VmStatus err_st = fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                  "Invalid integer input '%s'", buf.data);
        free(buf.data);
        return err_st;
    }
    if (errno == ERANGE || lval < INT_MIN || lval > INT_MAX) {
        VmStatus err_st = fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                  "Integer input overflow/out of range: '%s'", buf.data);
        free(buf.data);
        return err_st;
    }
    free(buf.data);

    VmValue val = vm_value_int((int)lval);
    if (!set_var(state, instr->dest, &val)) {
        return fail_vm(state, VM_ERR_OOM, instr->line,
                       "Out of memory storing integer input in '%s'", instr->dest);
    }
    return VM_OK;
}

static VmStatus exec_read_float(VmState *state, const TacInstr *instr) {
    if (!instr->dest || instr->dest[0] == '\0') {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing float input target");
    }
    const char *mode = instr->src1 ? instr->src1 : "token";
    int is_prefix = 0;
    if (strcmp(mode, "prefix") == 0) {
        is_prefix = 1;
    } else if (strcmp(mode, "token") != 0) {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                       "Unsupported float input mode '%s'", mode);
    }

    int ch = EOF;
    if (!vm_skip_leading_ws(state, &ch)) {
        return fail_input_eof(state, instr->line, "float");
    }

    VmCharBuf buf = { NULL, 0, 0 };
    if (is_prefix) {
        char sign_ch = 0;
        if (ch == '+' || ch == '-') {
            sign_ch = (char)ch;
            if (vm_buf_append(&buf, sign_ch, VM_MAX_INPUT_TOKEN_LEN) < 0) {
                free(buf.data);
                return fail_vm(state, VM_ERR_OOM, instr->line, "Out of memory reading float");
            }
            ch = vm_getc(state);
        }

        size_t digits_before = 0;
        while (ch != EOF && isdigit((unsigned char)ch)) {
            int rc = vm_buf_append(&buf, (char)ch, VM_MAX_INPUT_TOKEN_LEN);
            if (rc < 0) {
                free(buf.data);
                return fail_vm(state, rc == -1 ? VM_ERR_RUNTIME : VM_ERR_OOM, instr->line,
                               rc == -1 ? "Floating-point input exceeds maximum length"
                                        : "Out of memory reading float");
            }
            digits_before++;
            ch = vm_getc(state);
        }

        size_t digits_after = 0;
        int pushed_tail = 0;
        if (ch == '.') {
            int c2 = vm_getc(state);
            if (digits_before == 0 && (c2 == EOF || !isdigit((unsigned char)c2))) {
                int read_err = (c2 == EOF && state->in && ferror(state->in));
                if (c2 != EOF) {
                    vm_ungetc(state, c2);
                }
                vm_ungetc(state, '.');
                if (sign_ch != 0) {
                    vm_ungetc(state, (unsigned char)sign_ch);
                }
                free(buf.data);
                if (read_err) {
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input stream read error");
                }
                return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Invalid floating-point input");
            }
            int rc_dot = vm_buf_append(&buf, '.', VM_MAX_INPUT_TOKEN_LEN);
            if (rc_dot < 0) {
                if (c2 != EOF) {
                    vm_ungetc(state, c2);
                }
                free(buf.data);
                return fail_vm(state, rc_dot == -1 ? VM_ERR_RUNTIME : VM_ERR_OOM, instr->line,
                               rc_dot == -1 ? "Floating-point input exceeds maximum length"
                                            : "Out of memory reading float");
            }
            ch = c2;
            while (ch != EOF && isdigit((unsigned char)ch)) {
                int rc = vm_buf_append(&buf, (char)ch, VM_MAX_INPUT_TOKEN_LEN);
                if (rc < 0) {
                    free(buf.data);
                    return fail_vm(state, rc == -1 ? VM_ERR_RUNTIME : VM_ERR_OOM, instr->line,
                                   rc == -1 ? "Floating-point input exceeds maximum length"
                                            : "Out of memory reading float");
                }
                digits_after++;
                ch = vm_getc(state);
            }
        }

        if (digits_before + digits_after == 0) {
            int read_err = (ch == EOF && state->in && ferror(state->in));
            if (ch != EOF) {
                vm_ungetc(state, ch);
            }
            if (sign_ch != 0) {
                vm_ungetc(state, (unsigned char)sign_ch);
            }
            free(buf.data);
            if (read_err) {
                return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input stream read error");
            }
            return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Invalid floating-point input");
        }

        if (ch == 'e' || ch == 'E') {
            char tent[4];
            size_t tent_len = 0;
            tent[tent_len++] = (char)ch;
            int e2 = vm_getc(state);
            if (e2 == '+' || e2 == '-') {
                tent[tent_len++] = (char)e2;
                e2 = vm_getc(state);
            }
            if (e2 != EOF && isdigit((unsigned char)e2)) {
                for (size_t k = 0; k < tent_len; k++) {
                    int rc = vm_buf_append(&buf, tent[k], VM_MAX_INPUT_TOKEN_LEN);
                    if (rc < 0) {
                        free(buf.data);
                        return fail_vm(state, rc == -1 ? VM_ERR_RUNTIME : VM_ERR_OOM, instr->line,
                                       rc == -1 ? "Floating-point input exceeds maximum length"
                                                : "Out of memory reading float");
                    }
                }
                ch = e2;
                while (ch != EOF && isdigit((unsigned char)ch)) {
                    int rc = vm_buf_append(&buf, (char)ch, VM_MAX_INPUT_TOKEN_LEN);
                    if (rc < 0) {
                        free(buf.data);
                        return fail_vm(state, rc == -1 ? VM_ERR_RUNTIME : VM_ERR_OOM, instr->line,
                                       rc == -1 ? "Floating-point input exceeds maximum length"
                                                : "Out of memory reading float");
                    }
                    ch = vm_getc(state);
                }
            } else {
                if (e2 != EOF && !vm_ungetc(state, e2)) {
                    free(buf.data);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input pushback buffer overflow");
                }
                if (!vm_unget_slice_reverse(state, tent, tent_len)) {
                    free(buf.data);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input pushback buffer overflow");
                }
                pushed_tail = 1;
            }
        }

        if (!pushed_tail) {
            if (ch == EOF && state->in && ferror(state->in)) {
                free(buf.data);
                return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input stream read error");
            }
            if (ch != EOF && !vm_ungetc(state, ch)) {
                free(buf.data);
                return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input pushback buffer overflow");
            }
        }
    } else {
        VmStatus st = read_ws_delimited_token(
            state, instr->line, ch, VM_MAX_INPUT_TOKEN_LEN, "Floating-point input", &buf);
        if (st != VM_OK) {
            free(buf.data);
            return st;
        }
        if (!is_valid_decimal_float_token(buf.data)) {
            VmStatus err_st = fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                      "Invalid floating-point input '%s'",
                                      buf.data ? buf.data : "");
            free(buf.data);
            return err_st;
        }
    }

    char *endptr = NULL;
    errno = 0;
    double dval = strtod(buf.data, &endptr);
    if (endptr == buf.data || *endptr != '\0') {
        VmStatus err_st = fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                  "Invalid floating-point input '%s'", buf.data);
        free(buf.data);
        return err_st;
    }
    if (!isfinite(dval) || (errno == ERANGE && dval != 0.0)) {
        VmStatus err_st = fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                  "Floating-point input overflow/out of range: '%s'", buf.data);
        free(buf.data);
        return err_st;
    }
    free(buf.data);

    VmValue val = vm_value_float(dval);
    if (!set_var(state, instr->dest, &val)) {
        return fail_vm(state, VM_ERR_OOM, instr->line,
                       "Out of memory storing float input in '%s'", instr->dest);
    }
    return VM_OK;
}

static VmStatus exec_read_bool(VmState *state, const TacInstr *instr) {
    if (!instr->dest || instr->dest[0] == '\0') {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing boolean input target");
    }
    const char *mode = instr->src1 ? instr->src1 : "flex";
    int is_cpp = (strcmp(mode, "cpp") == 0);
    int is_java = (strcmp(mode, "java") == 0);
    int is_flex = (strcmp(mode, "flex") == 0);
    if (!is_cpp && !is_java && !is_flex) {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                       "Unsupported boolean input mode '%s'", mode);
    }

    int ch = EOF;
    if (!vm_skip_leading_ws(state, &ch)) {
        return fail_input_eof(state, instr->line, "bool");
    }

    VmCharBuf buf = { NULL, 0, 0 };
    VmStatus st = read_ws_delimited_token(
        state, instr->line, ch, VM_MAX_INPUT_TOKEN_LEN, "Boolean input", &buf);
    if (st != VM_OK) {
        free(buf.data);
        return st;
    }

    int bval = -1;
    if (is_cpp) {
        if (strcmp(buf.data, "1") == 0) {
            bval = 1;
        } else if (strcmp(buf.data, "0") == 0) {
            bval = 0;
        } else {
            VmStatus err_st = fail_vm(
                state, VM_ERR_RUNTIME, instr->line,
                "Invalid boolean input '%s' (expected 0 or 1; boolalpha is not supported)",
                buf.data);
            free(buf.data);
            return err_st;
        }
    } else if (is_java) {
        if (eq_nocase_vm(buf.data, "true")) {
            bval = 1;
        } else if (eq_nocase_vm(buf.data, "false")) {
            bval = 0;
        } else {
            VmStatus err_st = fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                      "Invalid boolean input '%s' (expected true or false)",
                                      buf.data);
            free(buf.data);
            return err_st;
        }
    } else {
        if (eq_nocase_vm(buf.data, "true") || strcmp(buf.data, "1") == 0) {
            bval = 1;
        } else if (eq_nocase_vm(buf.data, "false") || strcmp(buf.data, "0") == 0) {
            bval = 0;
        } else {
            VmStatus err_st = fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                      "Invalid boolean input '%s'", buf.data);
            free(buf.data);
            return err_st;
        }
    }
    free(buf.data);

    VmValue val = vm_value_bool(bval);
    if (!set_var(state, instr->dest, &val)) {
        return fail_vm(state, VM_ERR_OOM, instr->line,
                       "Out of memory storing boolean input in '%s'", instr->dest);
    }
    return VM_OK;
}

static VmStatus exec_read_str(VmState *state, const TacInstr *instr) {
    if (!instr->dest || instr->dest[0] == '\0') {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing string input target");
    }

    int has_cap = 0;
    size_t limit = VM_MAX_INPUT_TOKEN_LEN;
    if (instr->src1 != NULL) {
        char *endptr = NULL;
        errno = 0;
        unsigned long parsed = strtoul(instr->src1, &endptr, 10);
        if (instr->src1[0] == '\0' || *endptr != '\0' || errno == ERANGE || parsed == 0) {
            return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                           "Invalid string input capacity '%s'", instr->src1);
        }
        has_cap = 1;
        if ((size_t)parsed < limit) {
            limit = (size_t)parsed;
        }
    }

    int ch = EOF;
    if (!vm_skip_leading_ws(state, &ch)) {
        return fail_input_eof(state, instr->line, "string");
    }

    VmCharBuf buf = { NULL, 0, 0 };
    while (ch != EOF && !isspace((unsigned char)ch)) {
        if (buf.len >= limit) {
            if (has_cap) {
                /* Bounded %s/%Ns stops at capacity limit and leaves remainder unread. */
                if (!vm_ungetc(state, ch)) {
                    free(buf.data);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input pushback buffer overflow");
                }
                break;
            }
            free(buf.data);
            return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                           "String input exceeds maximum token length (%d bytes)",
                           VM_MAX_INPUT_TOKEN_LEN);
        }
        int rc = vm_buf_append(&buf, (char)ch, limit);
        if (rc == -2) {
            free(buf.data);
            return fail_vm(state, VM_ERR_OOM, instr->line, "Out of memory reading string");
        }
        ch = vm_getc(state);
    }

    if (ch == EOF && state->in && ferror(state->in)) {
        free(buf.data);
        return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input stream read error");
    }
    if (ch != EOF && isspace((unsigned char)ch) && !vm_ungetc(state, ch)) {
        free(buf.data);
        return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input pushback buffer overflow");
    }

    VmValue val = vm_value_uninit();
    int made = vm_value_make_string(&val, buf.data ? buf.data : "");
    free(buf.data);
    if (!made) {
        return fail_vm(state, VM_ERR_OOM, instr->line, "Out of memory allocating string input");
    }
    int stored = set_var(state, instr->dest, &val);
    vm_value_free(&val);
    if (!stored) {
        return fail_vm(state, VM_ERR_OOM, instr->line,
                       "Out of memory storing string input in '%s'", instr->dest);
    }
    return VM_OK;
}

static VmStatus exec_read_line(VmState *state, const TacInstr *instr) {
    if (!instr->dest || instr->dest[0] == '\0') {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing line input target");
    }

    if (state->out) {
        fflush(state->out);
    }

    VmCharBuf buf = { NULL, 0, 0 };
    for (;;) {
        int ch = vm_getc(state);
        if (ch == EOF) {
            if (state->in && ferror(state->in)) {
                free(buf.data);
                return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input stream read error");
            }
            if (buf.len == 0) {
                free(buf.data);
                return fail_input_eof(state, instr->line, "line");
            }
            break;
        }
        if (ch == '\n') {
            if (buf.len > 0 && buf.data[buf.len - 1] == '\r') {
                buf.data[--buf.len] = '\0';
            }
            break;
        }
        int rc = vm_buf_append(&buf, (char)ch, VM_MAX_INPUT_LINE_LEN);
        if (rc == -1) {
            free(buf.data);
            return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                           "Input line exceeds maximum length (%d bytes)",
                           VM_MAX_INPUT_LINE_LEN);
        }
        if (rc == -2) {
            free(buf.data);
            return fail_vm(state, VM_ERR_OOM, instr->line, "Out of memory reading line");
        }
    }

    VmValue val = vm_value_uninit();
    int made = vm_value_make_string(&val, buf.data ? buf.data : "");
    free(buf.data);
    if (!made) {
        return fail_vm(state, VM_ERR_OOM, instr->line, "Out of memory allocating line input");
    }
    int stored = set_var(state, instr->dest, &val);
    vm_value_free(&val);
    if (!stored) {
        return fail_vm(state, VM_ERR_OOM, instr->line,
                       "Out of memory storing line input in '%s'", instr->dest);
    }
    return VM_OK;
}

static VmStatus exec_scan_ws(VmState *state, const TacInstr *instr) {
    int ch = EOF;
    vm_skip_leading_ws(state, &ch);
    if (ch == EOF && state->in && ferror(state->in)) {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input stream read error");
    }
    if (ch != EOF && !vm_ungetc(state, ch)) {
        return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Input pushback buffer overflow");
    }
    return VM_OK;
}

static VmStatus exec_scan_lit(VmState *state, const TacInstr *instr) {
    VmValue lit = vm_value_uninit();
    VmStatus st = resolve_operand(state, instr->src1, instr->line, &lit);
    if (st != VM_OK) {
        vm_value_free(&lit);
        return st;
    }
    if (lit.kind != VM_VAL_STRING) {
        VmValueKind kind = lit.kind;
        vm_value_free(&lit);
        return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                       "scanf literal operand must be string (got %s)",
                       vm_value_kind_name(kind));
    }

    if (state->out) {
        fflush(state->out);
    }

    const char *s = lit.as.sval ? lit.as.sval : "";
    for (size_t i = 0; s[i] != '\0'; i++) {
        int ch = vm_getc(state);
        if (ch == EOF) {
            vm_value_free(&lit);
            return fail_input_eof(state, instr->line, "scanf literal");
        }
        if ((unsigned char)ch != (unsigned char)s[i]) {
            vm_ungetc(state, ch);
            VmStatus err_st = fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                      "Input format mismatch in scanf (expected '%s')", s);
            vm_value_free(&lit);
            return err_st;
        }
    }

    vm_value_free(&lit);
    return VM_OK;
}

VmStatus vm_execute_state(VmState *state, const TacList *tac) {
    if (!state || !tac) {
        if (state) {
            return fail_vm(state, VM_ERR_INVALID_INPUT, 0, "NULL VM state or TAC list");
        }
        return VM_ERR_INVALID_INPUT;
    }

    state->steps_executed = 0;
    state->pushback_len = 0;
    state->result.status = VM_OK;
    state->result.steps_executed = 0;
    state->result.error_line = 0;
    state->result.error_message[0] = '\0';
    clear_args(state);

    if (tac->count == 0 || !tac->head) {
        return VM_OK;
    }

    size_t count = (size_t)tac->count;
    TacInstr **code = (TacInstr **)malloc(count * sizeof(TacInstr *));
    if (!code) {
        return fail_vm(state, VM_ERR_OOM, 0, "Out of memory preparing TAC instructions");
    }

    size_t idx = 0;
    for (TacInstr *curr = tac->head; curr && idx < count; curr = curr->next) {
        code[idx++] = curr;
    }
    if (idx != count) {
        free(code);
        return fail_vm(state, VM_ERR_INVALID_INPUT, 0, "Inconsistent TAC instruction count");
    }

    VmStatus label_status = index_labels(state, code, count);
    if (label_status != VM_OK) {
        free(code);
        return label_status;
    }

    size_t pc = 0;
    while (pc < count) {
        const TacInstr *instr = code[pc];
        if (state->steps_executed >= state->max_steps) {
            free(code);
            return fail_vm(state, VM_ERR_STEP_LIMIT, instr->line,
                           "Instruction step limit (%lu) exceeded (possible infinite loop)",
                           (unsigned long)state->max_steps);
        }
        state->steps_executed++;

        switch (instr->opcode) {
            case TAC_OP_ASSIGN: {
                if (!instr->dest || instr->dest[0] == '\0') {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing assignment target");
                }
                VmValue val = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &val);
                if (st != VM_OK) {
                    free(code);
                    return st;
                }
                int stored = set_var(state, instr->dest, &val);
                vm_value_free(&val);
                if (!stored) {
                    free(code);
                    return fail_vm(state, VM_ERR_OOM, instr->line,
                                   "Out of memory assigning '%s'", instr->dest);
                }
                pc++;
                break;
            }

            case TAC_OP_ADD:
            case TAC_OP_SUB:
            case TAC_OP_MUL:
            case TAC_OP_DIV:
            case TAC_OP_MOD: {
                if (!instr->dest || instr->dest[0] == '\0') {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing arithmetic target");
                }
                VmValue lhs = vm_value_uninit();
                VmValue rhs = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &lhs);
                if (st == VM_OK) {
                    st = resolve_operand(state, instr->src2, instr->line, &rhs);
                }
                if (st != VM_OK) {
                    vm_value_free(&lhs);
                    vm_value_free(&rhs);
                    free(code);
                    return st;
                }
                VmValue res = vm_value_uninit();
                st = eval_arithmetic(state, instr, &lhs, &rhs, &res);
                vm_value_free(&lhs);
                vm_value_free(&rhs);
                if (st != VM_OK) {
                    vm_value_free(&res);
                    free(code);
                    return st;
                }
                int stored = set_var(state, instr->dest, &res);
                vm_value_free(&res);
                if (!stored) {
                    free(code);
                    return fail_vm(state, VM_ERR_OOM, instr->line,
                                   "Out of memory storing arithmetic result");
                }
                pc++;
                break;
            }

            case TAC_OP_EQ:
            case TAC_OP_NE:
            case TAC_OP_LT:
            case TAC_OP_GT:
            case TAC_OP_LE:
            case TAC_OP_GE: {
                if (!instr->dest || instr->dest[0] == '\0') {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing comparison target");
                }
                VmValue lhs = vm_value_uninit();
                VmValue rhs = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &lhs);
                if (st == VM_OK) {
                    st = resolve_operand(state, instr->src2, instr->line, &rhs);
                }
                if (st != VM_OK) {
                    vm_value_free(&lhs);
                    vm_value_free(&rhs);
                    free(code);
                    return st;
                }
                VmValue res = vm_value_uninit();
                st = eval_comparison(state, instr, &lhs, &rhs, &res);
                vm_value_free(&lhs);
                vm_value_free(&rhs);
                if (st != VM_OK) {
                    vm_value_free(&res);
                    free(code);
                    return st;
                }
                int stored = set_var(state, instr->dest, &res);
                vm_value_free(&res);
                if (!stored) {
                    free(code);
                    return fail_vm(state, VM_ERR_OOM, instr->line,
                                   "Out of memory storing comparison result");
                }
                pc++;
                break;
            }

            case TAC_OP_AND:
            case TAC_OP_OR: {
                if (!instr->dest || instr->dest[0] == '\0') {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing logical target");
                }
                VmValue lhs = vm_value_uninit();
                VmValue rhs = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &lhs);
                if (st == VM_OK) {
                    st = resolve_operand(state, instr->src2, instr->line, &rhs);
                }
                if (st != VM_OK) {
                    vm_value_free(&lhs);
                    vm_value_free(&rhs);
                    free(code);
                    return st;
                }
                int b1 = 0, b2 = 0;
                int ok1 = vm_value_is_truthy(&lhs, &b1);
                int ok2 = vm_value_is_truthy(&rhs, &b2);
                VmValueKind k1 = lhs.kind, k2 = rhs.kind;
                vm_value_free(&lhs);
                vm_value_free(&rhs);
                if (!ok1 || !ok2) {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                   "Logical operator requires boolean/numeric operands (got %s and %s)",
                                   vm_value_kind_name(k1), vm_value_kind_name(k2));
                }
                VmValue res = vm_value_bool((instr->opcode == TAC_OP_AND) ? (b1 && b2) : (b1 || b2));
                if (!set_var(state, instr->dest, &res)) {
                    free(code);
                    return fail_vm(state, VM_ERR_OOM, instr->line,
                                   "Out of memory storing logical result");
                }
                pc++;
                break;
            }

            case TAC_OP_NOT: {
                if (!instr->dest || instr->dest[0] == '\0') {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing logical NOT target");
                }
                VmValue op = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &op);
                if (st != VM_OK) {
                    vm_value_free(&op);
                    free(code);
                    return st;
                }
                int b = 0;
                int ok = vm_value_is_truthy(&op, &b);
                VmValueKind kind = op.kind;
                vm_value_free(&op);
                if (!ok) {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                   "Operator '!' requires boolean/numeric operand (got %s)",
                                   vm_value_kind_name(kind));
                }
                VmValue res = vm_value_bool(!b);
                if (!set_var(state, instr->dest, &res)) {
                    free(code);
                    return fail_vm(state, VM_ERR_OOM, instr->line,
                                   "Out of memory storing NOT result");
                }
                pc++;
                break;
            }

            case TAC_OP_NEG: {
                if (!instr->dest || instr->dest[0] == '\0') {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing unary minus target");
                }
                VmValue op = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &op);
                if (st != VM_OK) {
                    vm_value_free(&op);
                    free(code);
                    return st;
                }
                if (!vm_value_is_numeric(&op)) {
                    VmValueKind kind = op.kind;
                    vm_value_free(&op);
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                   "Unary '-' requires numeric operand (got %s)",
                                   vm_value_kind_name(kind));
                }
                VmValue res = (op.kind == VM_VAL_INT)
                                  ? vm_value_int(wrap_u32_to_i32(0u - (uint32_t)op.as.ival))
                                  : vm_value_float(-op.as.fval);
                vm_value_free(&op);
                if (!set_var(state, instr->dest, &res)) {
                    free(code);
                    return fail_vm(state, VM_ERR_OOM, instr->line,
                                   "Out of memory storing negation result");
                }
                pc++;
                break;
            }

            case TAC_OP_LABEL:
                pc++;
                break;

            case TAC_OP_GOTO: {
                size_t target_pc = 0;
                if (!instr->dest || !find_label_pc(state, instr->dest, &target_pc)) {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                   "Undefined jump target label '%s'",
                                   instr->dest ? instr->dest : "(null)");
                }
                pc = target_pc;
                break;
            }

            case TAC_OP_IF_GOTO: {
                VmValue cond = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &cond);
                if (st != VM_OK) {
                    vm_value_free(&cond);
                    free(code);
                    return st;
                }
                int b = 0;
                int ok = vm_value_is_truthy(&cond, &b);
                VmValueKind kind = cond.kind;
                vm_value_free(&cond);
                if (!ok) {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                   "Branch condition must be boolean/numeric (got %s)",
                                   vm_value_kind_name(kind));
                }
                size_t target_pc = 0;
                if (!instr->src2 || !find_label_pc(state, instr->src2, &target_pc)) {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                   "Undefined jump target label '%s'",
                                   instr->src2 ? instr->src2 : "(null)");
                }
                pc = b ? target_pc : (pc + 1);
                break;
            }

            case TAC_OP_PRINT: {
                VmValue val = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &val);
                if (st != VM_OK) {
                    vm_value_free(&val);
                    free(code);
                    return st;
                }
                print_vm_value(state->out, &val);
                fflush(state->out);
                vm_value_free(&val);
                pc++;
                break;
            }

            case TAC_OP_PRINTLN: {
                if (instr->src1) {
                    VmValue val = vm_value_uninit();
                    VmStatus st = resolve_operand(state, instr->src1, instr->line, &val);
                    if (st != VM_OK) {
                        vm_value_free(&val);
                        free(code);
                        return st;
                    }
                    print_vm_value(state->out, &val);
                    vm_value_free(&val);
                }
                fputc('\n', state->out);
                fflush(state->out);
                pc++;
                break;
            }

            case TAC_OP_ARG: {
                VmValue val = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &val);
                if (st != VM_OK) {
                    vm_value_free(&val);
                    clear_args(state);
                    free(code);
                    return st;
                }
                int pushed = push_arg(state, &val);
                vm_value_free(&val);
                if (!pushed) {
                    clear_args(state);
                    free(code);
                    return fail_vm(state, VM_ERR_OOM, instr->line,
                                   "Out of memory pushing printf argument");
                }
                pc++;
                break;
            }

            case TAC_OP_PRINTF: {
                VmStatus st = exec_printf(state, instr);
                if (st != VM_OK) {
                    free(code);
                    return st;
                }
                pc++;
                break;
            }

            case TAC_OP_ITOF: {
                if (!instr->dest || instr->dest[0] == '\0') {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing float conversion target");
                }
                VmValue op = vm_value_uninit();
                VmStatus st = resolve_operand(state, instr->src1, instr->line, &op);
                if (st != VM_OK) {
                    vm_value_free(&op);
                    free(code);
                    return st;
                }
                if (!vm_value_is_numeric(&op)) {
                    VmValueKind kind = op.kind;
                    vm_value_free(&op);
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                                   "Implicit float conversion requires numeric operand (got %s)",
                                   vm_value_kind_name(kind));
                }
                VmValue fval = vm_value_float(vm_value_as_double(&op));
                vm_value_free(&op);
                if (!set_var(state, instr->dest, &fval)) {
                    free(code);
                    return fail_vm(state, VM_ERR_OOM, instr->line,
                                   "Out of memory assigning '%s'", instr->dest);
                }
                pc++;
                break;
            }

            case TAC_OP_UNINIT: {
                if (!instr->dest || instr->dest[0] == '\0') {
                    free(code);
                    return fail_vm(state, VM_ERR_RUNTIME, instr->line, "Missing uninit slot target");
                }
                VmValue uninit = vm_value_uninit();
                if (!set_var(state, instr->dest, &uninit)) {
                    free(code);
                    return fail_vm(state, VM_ERR_OOM, instr->line,
                                   "Out of memory resetting '%s'", instr->dest);
                }
                pc++;
                break;
            }

            case TAC_OP_READ_INT: {
                VmStatus st = exec_read_int(state, instr);
                if (st != VM_OK) {
                    free(code);
                    return st;
                }
                pc++;
                break;
            }

            case TAC_OP_READ_FLOAT: {
                VmStatus st = exec_read_float(state, instr);
                if (st != VM_OK) {
                    free(code);
                    return st;
                }
                pc++;
                break;
            }

            case TAC_OP_READ_BOOL: {
                VmStatus st = exec_read_bool(state, instr);
                if (st != VM_OK) {
                    free(code);
                    return st;
                }
                pc++;
                break;
            }

            case TAC_OP_READ_STR: {
                VmStatus st = exec_read_str(state, instr);
                if (st != VM_OK) {
                    free(code);
                    return st;
                }
                pc++;
                break;
            }

            case TAC_OP_READ_LINE: {
                VmStatus st = exec_read_line(state, instr);
                if (st != VM_OK) {
                    free(code);
                    return st;
                }
                pc++;
                break;
            }

            case TAC_OP_SCAN_WS: {
                VmStatus st = exec_scan_ws(state, instr);
                if (st != VM_OK) {
                    free(code);
                    return st;
                }
                pc++;
                break;
            }

            case TAC_OP_SCAN_LIT: {
                VmStatus st = exec_scan_lit(state, instr);
                if (st != VM_OK) {
                    free(code);
                    return st;
                }
                pc++;
                break;
            }

            default:
                free(code);
                return fail_vm(state, VM_ERR_RUNTIME, instr->line,
                               "Unknown TAC opcode (%d)", (int)instr->opcode);
        }
    }

    free(code);
    state->result.status = VM_OK;
    state->result.steps_executed = state->steps_executed;
    state->result.error_line = 0;
    state->result.error_message[0] = '\0';
    return VM_OK;
}

VmStatus vm_execute(const TacList *tac, const VmConfig *config, VmResult *result) {
    if (!tac) {
        if (result) {
            result->status = VM_ERR_INVALID_INPUT;
            result->steps_executed = 0;
            result->error_line = 0;
            snprintf(result->error_message, sizeof(result->error_message), "NULL TAC list");
        }
        return VM_ERR_INVALID_INPUT;
    }

    VmState *state = vm_state_create(config);
    if (!state) {
        if (result) {
            result->status = VM_ERR_OOM;
            result->steps_executed = 0;
            result->error_line = 0;
            snprintf(result->error_message, sizeof(result->error_message),
                     "Out of memory creating VM state");
        }
        return VM_ERR_OOM;
    }

    VmStatus st = vm_execute_state(state, tac);
    if (result) {
        *result = state->result;
    }
    vm_state_destroy(state);
    return st;
}
