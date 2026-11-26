/* ==============================================================================
 * CompileCraft - Shared TAC Virtual Machine Execution Engine (Milestone 15)
 *
 * Implements instruction dispatch, variable/temporary storage, label jump
 * resolution, print/println/printf output formatting, and bounded-step guards.
 * ============================================================================== */

#include "vm.h"
#include <ctype.h>
#include <limits.h>
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

VmStatus vm_execute_state(VmState *state, const TacList *tac) {
    if (!state || !tac) {
        if (state) {
            return fail_vm(state, VM_ERR_INVALID_INPUT, 0, "NULL VM state or TAC list");
        }
        return VM_ERR_INVALID_INPUT;
    }

    state->steps_executed = 0;
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
