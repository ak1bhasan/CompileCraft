/* ==============================================================================
 * CompileCraft - Three-Address Code (TAC) Generation Implementation (Milestone 7)
 *
 * Logical && / ||: eager value evaluation into temporaries (DEC-07 still OPEN for
 * short-circuit operand evaluation). Control-flow statements already use labels
 * and conditional jumps around statement bodies.
 * ============================================================================== */

#include "tac.h"
#include <float.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef DBL_DECIMAL_DIG
#define DBL_DECIMAL_DIG 17
#endif

typedef enum TacExprKind {
    TAC_EXPR_UNKNOWN = 0,
    TAC_EXPR_INT,
    TAC_EXPR_FLOAT,
    TAC_EXPR_BOOL
} TacExprKind;

typedef struct TacVarBinding {
    char *source_name;
    char *tac_name;
    AstTypeTag type_tag;
} TacVarBinding;

struct TacScope {
    TacVarBinding *entries;
    size_t count;
    size_t capacity;
    struct TacScope *parent;
};

static void free_instruction_chain(TacInstr *head) {
    TacInstr *curr = head;
    while (curr) {
        TacInstr *next = curr->next;
        free(curr->dest);
        free(curr->src1);
        free(curr->src2);
        free(curr);
        curr = next;
    }
}

static void mark_failed(TacGenerator *gen) {
    if (gen) {
        gen->failed = 1;
    }
}

static char *duplicate_str(TacGenerator *gen, const char *s) {
    if (!s) {
        return NULL;
    }
    char *copy = strdup(s);
    if (!copy) {
        mark_failed(gen);
    }
    return copy;
}

static char *format_int_literal(TacGenerator *gen, int val) {
    char buf[32];
    snprintf(buf, sizeof(buf), "%d", val);
    return duplicate_str(gen, buf);
}

static char *format_float_literal(TacGenerator *gen, double val) {
    char buf[64];
    snprintf(buf, sizeof(buf), "%.*g", DBL_DECIMAL_DIG, val);
    if (strchr(buf, '.') == NULL && strchr(buf, 'e') == NULL && strchr(buf, 'E') == NULL) {
        size_t len = strlen(buf);
        if (len + 2 < sizeof(buf)) {
            buf[len] = '.';
            buf[len + 1] = '0';
            buf[len + 2] = '\0';
        }
    }
    return duplicate_str(gen, buf);
}

static void free_scope_frame(TacScope *scope) {
    if (!scope) {
        return;
    }
    for (size_t i = 0; i < scope->count; i++) {
        free(scope->entries[i].source_name);
        free(scope->entries[i].tac_name);
    }
    free(scope->entries);
    free(scope);
}

static void pop_scope(TacGenerator *gen) {
    if (!gen || !gen->scope) {
        return;
    }
    TacScope *top = gen->scope;
    gen->scope = top->parent;
    free_scope_frame(top);
}

static int push_scope(TacGenerator *gen) {
    if (!gen) {
        return 0;
    }
    TacScope *frame = (TacScope *)calloc(1, sizeof(TacScope));
    if (!frame) {
        mark_failed(gen);
        return 0;
    }
    frame->parent = gen->scope;
    gen->scope = frame;
    return 1;
}

static int is_name_seen(const TacGenerator *gen, const char *name) {
    if (!gen || !name) {
        return 0;
    }
    for (size_t i = 0; i < gen->seen_count; i++) {
        if (strcmp(gen->seen_names[i], name) == 0) {
            return 1;
        }
    }
    return 0;
}

static int record_seen_name(TacGenerator *gen, const char *name) {
    if (!gen || !name) {
        return 0;
    }
    if (is_name_seen(gen, name)) {
        return 1;
    }
    if (gen->seen_count == gen->seen_capacity) {
        size_t next_cap = (gen->seen_capacity == 0) ? 16 : (gen->seen_capacity * 2);
        char **grown = (char **)realloc(gen->seen_names, next_cap * sizeof(char *));
        if (!grown) {
            mark_failed(gen);
            return 0;
        }
        gen->seen_names = grown;
        gen->seen_capacity = next_cap;
    }
    char *copy = duplicate_str(gen, name);
    if (!copy) {
        return 0;
    }
    gen->seen_names[gen->seen_count++] = copy;
    return 1;
}

static const TacVarBinding *lookup_tac_var(const TacGenerator *gen, const char *name) {
    if (!gen || !name) {
        return NULL;
    }
    for (const TacScope *s = gen->scope; s != NULL; s = s->parent) {
        for (size_t i = s->count; i > 0; i--) {
            const TacVarBinding *entry = &s->entries[i - 1];
            if (strcmp(entry->source_name, name) == 0) {
                return entry;
            }
        }
    }
    return NULL;
}

static const char *declare_tac_var(
    TacGenerator *gen,
    const char *source_name,
    AstTypeTag type_tag) {
    if (!gen || gen->failed || !source_name) {
        return NULL;
    }
    if (!gen->scope && !push_scope(gen)) {
        return NULL;
    }

    char *tac_name = NULL;
    if (!is_name_seen(gen, source_name)) {
        tac_name = duplicate_str(gen, source_name);
        if (!tac_name || !record_seen_name(gen, source_name)) {
            free(tac_name);
            return NULL;
        }
    } else {
        int id = ++gen->next_var_id;
        int needed = snprintf(NULL, 0, "%s$%d", source_name, id);
        if (needed < 0) {
            mark_failed(gen);
            return NULL;
        }
        size_t cap = (size_t)needed + 1;
        tac_name = (char *)malloc(cap);
        if (!tac_name) {
            mark_failed(gen);
            return NULL;
        }
        snprintf(tac_name, cap, "%s$%d", source_name, id);
    }

    TacScope *top = gen->scope;
    if (top->count == top->capacity) {
        size_t next_cap = (top->capacity == 0) ? 8 : (top->capacity * 2);
        TacVarBinding *grown = (TacVarBinding *)realloc(top->entries, next_cap * sizeof(TacVarBinding));
        if (!grown) {
            free(tac_name);
            mark_failed(gen);
            return NULL;
        }
        top->entries = grown;
        top->capacity = next_cap;
    }

    char *src_copy = duplicate_str(gen, source_name);
    if (!src_copy) {
        free(tac_name);
        return NULL;
    }

    top->entries[top->count].source_name = src_copy;
    top->entries[top->count].tac_name = tac_name;
    top->entries[top->count].type_tag = type_tag;
    top->count++;
    return tac_name;
}

static TacExprKind infer_expr_kind(const TacGenerator *gen, const AstNode *expr) {
    if (!expr) {
        return TAC_EXPR_UNKNOWN;
    }
    switch (expr->kind) {
        case AST_LITERAL:
            switch (expr->u.literal.lit_kind) {
                case AST_LIT_INT:   return TAC_EXPR_INT;
                case AST_LIT_FLOAT: return TAC_EXPR_FLOAT;
                case AST_LIT_BOOL:  return TAC_EXPR_BOOL;
                default:            return TAC_EXPR_UNKNOWN;
            }
        case AST_IDENTIFIER: {
            const TacVarBinding *b = lookup_tac_var(gen, expr->u.identifier.name);
            if (!b) {
                return TAC_EXPR_UNKNOWN;
            }
            if (b->type_tag == AST_TYPE_INT) return TAC_EXPR_INT;
            if (b->type_tag == AST_TYPE_FLOAT) return TAC_EXPR_FLOAT;
            if (b->type_tag == AST_TYPE_BOOL) return TAC_EXPR_BOOL;
            return TAC_EXPR_UNKNOWN;
        }
        case AST_UNARY_OP:
            if (expr->u.unary.op == AST_OP_NOT) {
                return TAC_EXPR_BOOL;
            }
            return infer_expr_kind(gen, expr->u.unary.operand);
        case AST_BINARY_OP: {
            AstBinOp op = expr->u.binary.op;
            if (op == AST_OP_EQ || op == AST_OP_NE || op == AST_OP_LT ||
                op == AST_OP_GT || op == AST_OP_LE || op == AST_OP_GE ||
                op == AST_OP_AND || op == AST_OP_OR) {
                return TAC_EXPR_BOOL;
            }
            if (op == AST_OP_MOD) {
                return TAC_EXPR_INT;
            }
            TacExprKind lt = infer_expr_kind(gen, expr->u.binary.left);
            TacExprKind rt = infer_expr_kind(gen, expr->u.binary.right);
            if (lt == TAC_EXPR_FLOAT || rt == TAC_EXPR_FLOAT) {
                return TAC_EXPR_FLOAT;
            }
            if (lt == TAC_EXPR_INT && rt == TAC_EXPR_INT) {
                return TAC_EXPR_INT;
            }
            return TAC_EXPR_UNKNOWN;
        }
        default:
            return TAC_EXPR_UNKNOWN;
    }
}

static TacOpcode binop_to_tac_opcode(AstBinOp op) {
    switch (op) {
        case AST_OP_ADD: return TAC_OP_ADD;
        case AST_OP_SUB: return TAC_OP_SUB;
        case AST_OP_MUL: return TAC_OP_MUL;
        case AST_OP_DIV: return TAC_OP_DIV;
        case AST_OP_MOD: return TAC_OP_MOD;
        case AST_OP_EQ:  return TAC_OP_EQ;
        case AST_OP_NE:  return TAC_OP_NE;
        case AST_OP_LT:  return TAC_OP_LT;
        case AST_OP_GT:  return TAC_OP_GT;
        case AST_OP_LE:  return TAC_OP_LE;
        case AST_OP_GE:  return TAC_OP_GE;
        case AST_OP_AND: return TAC_OP_AND;
        case AST_OP_OR:  return TAC_OP_OR;
        default:         return TAC_OP_ASSIGN;
    }
}

TacGenerator *tac_generator_create(void) {
    TacGenerator *gen = (TacGenerator *)malloc(sizeof(TacGenerator));
    if (!gen) {
        return NULL;
    }

    gen->instructions.head = NULL;
    gen->instructions.tail = NULL;
    gen->instructions.count = 0;
    gen->next_temp_id = 1;
    gen->next_label_id = 1;
    gen->next_var_id = 1;
    gen->current_line = 0;
    gen->block_depth = 0;
    gen->scope = NULL;
    gen->seen_names = NULL;
    gen->seen_count = 0;
    gen->seen_capacity = 0;
    gen->failed = 0;
    return gen;
}

void tac_generator_destroy(TacGenerator *gen) {
    if (!gen) {
        return;
    }
    while (gen->scope) {
        pop_scope(gen);
    }
    for (size_t i = 0; i < gen->seen_count; i++) {
        free(gen->seen_names[i]);
    }
    free(gen->seen_names);
    free(gen);
}

static char *new_temp(TacGenerator *gen) {
    if (!gen || gen->failed) {
        return NULL;
    }
    char buf[32];
    snprintf(buf, sizeof(buf), "t%d", gen->next_temp_id++);
    return duplicate_str(gen, buf);
}

static char *new_label(TacGenerator *gen) {
    if (!gen || gen->failed) {
        return NULL;
    }
    char buf[32];
    snprintf(buf, sizeof(buf), "L%d", gen->next_label_id++);
    return duplicate_str(gen, buf);
}

static int emit_instr(
    TacGenerator *gen,
    TacOpcode opcode,
    const char *dest,
    const char *src1,
    const char *src2) {
    if (!gen || gen->failed) {
        return 0;
    }

    TacInstr *instr = (TacInstr *)malloc(sizeof(TacInstr));
    if (!instr) {
        mark_failed(gen);
        return 0;
    }

    instr->opcode = opcode;
    instr->dest = NULL;
    instr->src1 = NULL;
    instr->src2 = NULL;
    instr->line = gen->current_line;
    instr->next = NULL;

    if (dest) {
        instr->dest = duplicate_str(gen, dest);
        if (!instr->dest) {
            free(instr);
            return 0;
        }
    }
    if (src1) {
        instr->src1 = duplicate_str(gen, src1);
        if (!instr->src1) {
            free(instr->dest);
            free(instr);
            return 0;
        }
    }
    if (src2) {
        instr->src2 = duplicate_str(gen, src2);
        if (!instr->src2) {
            free(instr->dest);
            free(instr->src1);
            free(instr);
            return 0;
        }
    }

    if (!gen->instructions.head) {
        gen->instructions.head = instr;
        gen->instructions.tail = instr;
    } else {
        gen->instructions.tail->next = instr;
        gen->instructions.tail = instr;
    }
    gen->instructions.count++;
    return 1;
}

/* Returns owned operand string, or NULL on failure. */
static char *generate_expr(TacGenerator *gen, const AstNode *expr) {
    if (!gen || gen->failed) {
        return NULL;
    }
    if (!expr) {
        mark_failed(gen);
        return NULL;
    }

    int prev_line = gen->current_line;
    if (expr->line > 0) {
        gen->current_line = expr->line;
    }

    char *result = NULL;

    switch (expr->kind) {
        case AST_LITERAL: {
            switch (expr->u.literal.lit_kind) {
                case AST_LIT_INT:
                    result = format_int_literal(gen, expr->u.literal.as.ival);
                    break;
                case AST_LIT_FLOAT:
                    result = format_float_literal(gen, expr->u.literal.as.fval);
                    break;
                case AST_LIT_BOOL:
                    result = duplicate_str(gen, expr->u.literal.as.bval ? "true" : "false");
                    break;
                case AST_LIT_STRING:
                    result = duplicate_str(gen, expr->u.literal.as.sval ? expr->u.literal.as.sval : "\"\"");
                    break;
                default:
                    mark_failed(gen);
                    break;
            }
            break;
        }

        case AST_IDENTIFIER: {
            if (!expr->u.identifier.name) {
                mark_failed(gen);
            } else {
                const TacVarBinding *b = lookup_tac_var(gen, expr->u.identifier.name);
                result = duplicate_str(gen, b ? b->tac_name : expr->u.identifier.name);
            }
            break;
        }

        case AST_UNARY_OP: {
            char *op_val = generate_expr(gen, expr->u.unary.operand);
            if (!op_val) {
                break;
            }
            char *temp = new_temp(gen);
            if (!temp) {
                free(op_val);
                break;
            }

            if (expr->line > 0) {
                gen->current_line = expr->line;
            }
            TacOpcode code = (expr->u.unary.op == AST_OP_NOT) ? TAC_OP_NOT : TAC_OP_NEG;
            if (!emit_instr(gen, code, temp, op_val, NULL)) {
                free(op_val);
                free(temp);
                break;
            }

            free(op_val);
            result = temp;
            break;
        }

        case AST_BINARY_OP: {
            char *left_val = generate_expr(gen, expr->u.binary.left);
            if (!left_val) {
                break;
            }
            char *right_val = generate_expr(gen, expr->u.binary.right);
            if (!right_val) {
                free(left_val);
                break;
            }
            char *temp = new_temp(gen);
            if (!temp) {
                free(left_val);
                free(right_val);
                break;
            }

            if (expr->line > 0) {
                gen->current_line = expr->line;
            }
            TacOpcode code = binop_to_tac_opcode(expr->u.binary.op);
            if (!emit_instr(gen, code, temp, left_val, right_val)) {
                free(left_val);
                free(right_val);
                free(temp);
                break;
            }

            free(left_val);
            free(right_val);
            result = temp;
            break;
        }

        default:
            mark_failed(gen);
            break;
    }

    gen->current_line = prev_line;
    return result;
}

static void generate_statement(TacGenerator *gen, const AstNode *stmt);

static void generate_stmt_list(TacGenerator *gen, const AstNode *first) {
    const AstNode *curr = first;
    while (curr && !gen->failed) {
        generate_statement(gen, curr);
        curr = curr->next;
    }
}

static void generate_block(TacGenerator *gen, const AstNode *block) {
    if (!gen || gen->failed || !block) {
        return;
    }
    if (!push_scope(gen)) {
        return;
    }
    gen->block_depth++;
    generate_stmt_list(gen, block->u.block.stmts);
    gen->block_depth--;
    pop_scope(gen);
}

static int expr_has_string_add(const AstNode *node) {
    if (!node) {
        return 0;
    }
    if (node->kind == AST_LITERAL && node->u.literal.lit_kind == AST_LIT_STRING) {
        return 1;
    }
    if (node->kind == AST_BINARY_OP && node->u.binary.op == AST_OP_ADD) {
        return expr_has_string_add(node->u.binary.left) ||
               expr_has_string_add(node->u.binary.right);
    }
    return 0;
}

static int generate_concat_item(TacGenerator *gen, const AstNode *expr, int newline) {
    if (!gen || gen->failed || !expr) {
        return 0;
    }
    if (expr->kind == AST_BINARY_OP && expr->u.binary.op == AST_OP_ADD &&
        expr_has_string_add(expr)) {
        if (!generate_concat_item(gen, expr->u.binary.left, 0)) {
            return 0;
        }
        return generate_concat_item(gen, expr->u.binary.right, newline);
    }

    char *val = generate_expr(gen, expr);
    TacOpcode op = newline ? TAC_OP_PRINTLN : TAC_OP_PRINT;
    if (!val || !emit_instr(gen, op, NULL, val, NULL)) {
        free(val);
        mark_failed(gen);
        return 0;
    }
    free(val);
    return 1;
}

static int generate_printf_output(TacGenerator *gen, const AstNode *stmt) {
    const AstNode *fmt = stmt->u.output_stmt.items;
    const AstNode *arg;
    char *fmt_val;

    if (!fmt) {
        mark_failed(gen);
        return 0;
    }

    arg = fmt->next;
    while (arg) {
        char *val = generate_expr(gen, arg);
        if (!val || !emit_instr(gen, TAC_OP_ARG, NULL, val, NULL)) {
            free(val);
            mark_failed(gen);
            return 0;
        }
        free(val);
        arg = arg->next;
    }

    fmt_val = generate_expr(gen, fmt);
    if (!fmt_val || !emit_instr(gen, TAC_OP_PRINTF, NULL, fmt_val, NULL)) {
        free(fmt_val);
        mark_failed(gen);
        return 0;
    }
    free(fmt_val);
    return 1;
}

static void generate_if(TacGenerator *gen, const AstNode *stmt) {
    if (!gen || gen->failed || !stmt) {
        return;
    }

    char *cond_val = generate_expr(gen, stmt->u.if_stmt.cond);
    char *l_then = new_label(gen);
    char *l_end = new_label(gen);
    if (!cond_val || !l_then || !l_end) {
        free(cond_val);
        free(l_then);
        free(l_end);
        mark_failed(gen);
        return;
    }

    if (stmt->u.if_stmt.else_branch) {
        char *l_else = new_label(gen);
        if (!l_else) {
            free(cond_val);
            free(l_then);
            free(l_end);
            return;
        }

        if (!emit_instr(gen, TAC_OP_IF_GOTO, NULL, cond_val, l_then) ||
            !emit_instr(gen, TAC_OP_GOTO, l_else, NULL, NULL)) {
            free(cond_val);
            free(l_then);
            free(l_else);
            free(l_end);
            return;
        }

        if (!emit_instr(gen, TAC_OP_LABEL, l_then, NULL, NULL)) {
            free(cond_val);
            free(l_then);
            free(l_else);
            free(l_end);
            return;
        }
        generate_statement(gen, stmt->u.if_stmt.then_branch);
        if (gen->failed ||
            !emit_instr(gen, TAC_OP_GOTO, l_end, NULL, NULL) ||
            !emit_instr(gen, TAC_OP_LABEL, l_else, NULL, NULL)) {
            free(cond_val);
            free(l_then);
            free(l_else);
            free(l_end);
            return;
        }
        generate_statement(gen, stmt->u.if_stmt.else_branch);
        if (gen->failed || !emit_instr(gen, TAC_OP_LABEL, l_end, NULL, NULL)) {
            free(cond_val);
            free(l_then);
            free(l_else);
            free(l_end);
            return;
        }

        free(l_else);
    } else {
        if (!emit_instr(gen, TAC_OP_IF_GOTO, NULL, cond_val, l_then) ||
            !emit_instr(gen, TAC_OP_GOTO, l_end, NULL, NULL) ||
            !emit_instr(gen, TAC_OP_LABEL, l_then, NULL, NULL)) {
            free(cond_val);
            free(l_then);
            free(l_end);
            return;
        }
        generate_statement(gen, stmt->u.if_stmt.then_branch);
        if (gen->failed || !emit_instr(gen, TAC_OP_LABEL, l_end, NULL, NULL)) {
            free(cond_val);
            free(l_then);
            free(l_end);
            return;
        }
    }

    free(cond_val);
    free(l_then);
    free(l_end);
}

static void generate_while(TacGenerator *gen, const AstNode *stmt) {
    if (!gen || gen->failed || !stmt) {
        return;
    }

    char *l_head = new_label(gen);
    char *l_body = new_label(gen);
    char *l_end = new_label(gen);
    if (!l_head || !l_body || !l_end) {
        free(l_head);
        free(l_body);
        free(l_end);
        return;
    }

    if (!emit_instr(gen, TAC_OP_LABEL, l_head, NULL, NULL)) {
        free(l_head);
        free(l_body);
        free(l_end);
        return;
    }

    char *cond_val = generate_expr(gen, stmt->u.while_stmt.cond);
    if (!cond_val ||
        !emit_instr(gen, TAC_OP_IF_GOTO, NULL, cond_val, l_body) ||
        !emit_instr(gen, TAC_OP_GOTO, l_end, NULL, NULL) ||
        !emit_instr(gen, TAC_OP_LABEL, l_body, NULL, NULL)) {
        free(cond_val);
        free(l_head);
        free(l_body);
        free(l_end);
        return;
    }

    generate_statement(gen, stmt->u.while_stmt.body);
    if (stmt->line > 0) {
        gen->current_line = stmt->line;
    }
    if (gen->failed ||
        !emit_instr(gen, TAC_OP_GOTO, l_head, NULL, NULL) ||
        !emit_instr(gen, TAC_OP_LABEL, l_end, NULL, NULL)) {
        free(cond_val);
        free(l_head);
        free(l_body);
        free(l_end);
        return;
    }

    free(cond_val);
    free(l_head);
    free(l_body);
    free(l_end);
}

static void generate_statement(TacGenerator *gen, const AstNode *stmt) {
    if (!gen || gen->failed || !stmt) {
        return;
    }

    int prev_line = gen->current_line;
    if (stmt->line > 0) {
        gen->current_line = stmt->line;
    }

    switch (stmt->kind) {
        case AST_VAR_DECL: {
            if (!stmt->u.var_decl.name || !stmt->u.var_decl.name->u.identifier.name) {
                mark_failed(gen);
                return;
            }
            const char *src_name = stmt->u.var_decl.name->u.identifier.name;
            if (stmt->u.var_decl.init) {
                /* Evaluate initializer before inserting new binding to match semantic_analyze scope order. */
                TacExprKind rhs_kind = infer_expr_kind(gen, stmt->u.var_decl.init);
                char *init_val = generate_expr(gen, stmt->u.var_decl.init);
                if (!init_val) {
                    mark_failed(gen);
                    return;
                }
                const char *tac_name = declare_tac_var(gen, src_name, stmt->u.var_decl.type_tag);
                if (!tac_name) {
                    free(init_val);
                    return;
                }
                TacOpcode op = TAC_OP_ASSIGN;
                if (stmt->u.var_decl.type_tag == AST_TYPE_FLOAT && rhs_kind == TAC_EXPR_INT) {
                    op = TAC_OP_ITOF;
                }
                if (!emit_instr(gen, op, tac_name, init_val, NULL)) {
                    free(init_val);
                    return;
                }
                free(init_val);
            } else {
                const char *tac_name = declare_tac_var(gen, src_name, stmt->u.var_decl.type_tag);
                if (!tac_name) {
                    return;
                }
                if (gen->block_depth > 0 && !emit_instr(gen, TAC_OP_UNINIT, tac_name, NULL, NULL)) {
                    return;
                }
            }
            break;
        }

        case AST_ASSIGN: {
            char *val = generate_expr(gen, stmt->u.assign.value);
            if (!val || !stmt->u.assign.target ||
                stmt->u.assign.target->kind != AST_IDENTIFIER) {
                free(val);
                mark_failed(gen);
                return;
            }
            const char *target_name = stmt->u.assign.target->u.identifier.name;
            const TacVarBinding *b = lookup_tac_var(gen, target_name);
            const char *dest_name = b ? b->tac_name : target_name;
            TacOpcode op = TAC_OP_ASSIGN;
            if (b && b->type_tag == AST_TYPE_FLOAT &&
                infer_expr_kind(gen, stmt->u.assign.value) == TAC_EXPR_INT) {
                op = TAC_OP_ITOF;
            }
            if (!emit_instr(gen, op, dest_name, val, NULL)) {
                free(val);
                return;
            }
            free(val);
            break;
        }

        case AST_EXPR_STMT: {
            char *val = generate_expr(gen, stmt->u.expr_stmt.expr);
            free(val);
            break;
        }

        case AST_EMPTY_STMT:
            break;

        case AST_BLOCK:
            generate_block(gen, stmt);
            break;

        case AST_SEQ:
            generate_stmt_list(gen, stmt->u.seq.stmts);
            break;

        case AST_IF:
            generate_if(gen, stmt);
            break;

        case AST_WHILE:
            generate_while(gen, stmt);
            break;

        case AST_PRINT: {
            char *val = generate_expr(gen, stmt->u.print_stmt.expr);
            if (!val || !emit_instr(gen, TAC_OP_PRINT, NULL, val, NULL)) {
                free(val);
                mark_failed(gen);
                return;
            }
            free(val);
            break;
        }

        case AST_OUTPUT: {
            if (stmt->u.output_stmt.mode == AST_OUTPUT_PRINTF) {
                if (!generate_printf_output(gen, stmt)) {
                    return;
                }
                break;
            }
            const AstNode *item = stmt->u.output_stmt.items;
            if (!item) {
                if (stmt->u.output_stmt.newline &&
                    !emit_instr(gen, TAC_OP_PRINTLN, NULL, NULL, NULL)) {
                    mark_failed(gen);
                    return;
                }
                break;
            }
            while (item) {
                int nl = (stmt->u.output_stmt.newline && item->next == NULL);
                if (stmt->u.output_stmt.mode == AST_OUTPUT_CONCAT) {
                    if (!generate_concat_item(gen, item, nl)) {
                        return;
                    }
                } else {
                    char *val = generate_expr(gen, item);
                    TacOpcode op = nl ? TAC_OP_PRINTLN : TAC_OP_PRINT;
                    if (!val || !emit_instr(gen, op, NULL, val, NULL)) {
                        free(val);
                        mark_failed(gen);
                        return;
                    }
                    free(val);
                }
                item = item->next;
            }
            break;
        }

        default:
            break;
    }

    gen->current_line = prev_line;
}

TacList *tac_generate_program(const AstNode *root) {
    if (!root || root->kind != AST_PROGRAM) {
        return NULL;
    }

    TacGenerator *gen = tac_generator_create();
    if (!gen) {
        return NULL;
    }

    const AstNode *curr = root->u.program.stmts;
    while (curr && !gen->failed) {
        generate_statement(gen, curr);
        curr = curr->next;
    }

    if (gen->failed) {
        free_instruction_chain(gen->instructions.head);
        tac_generator_destroy(gen);
        return NULL;
    }

    TacList *result = (TacList *)malloc(sizeof(TacList));
    if (!result) {
        free_instruction_chain(gen->instructions.head);
        tac_generator_destroy(gen);
        return NULL;
    }

    *result = gen->instructions;
    tac_generator_destroy(gen);
    return result;
}

void tac_print(const TacList *list, FILE *out) {
    if (!list || !out) {
        return;
    }

    TacInstr *curr = list->head;
    while (curr) {
        switch (curr->opcode) {
            case TAC_OP_ASSIGN:
                fprintf(out, "%s = %s\n", curr->dest, curr->src1);
                break;

            case TAC_OP_ADD:
            case TAC_OP_SUB:
            case TAC_OP_MUL:
            case TAC_OP_DIV:
            case TAC_OP_MOD:
            case TAC_OP_EQ:
            case TAC_OP_NE:
            case TAC_OP_LT:
            case TAC_OP_GT:
            case TAC_OP_LE:
            case TAC_OP_GE:
            case TAC_OP_AND:
            case TAC_OP_OR: {
                const char *op_str = "?";
                switch (curr->opcode) {
                    case TAC_OP_ADD: op_str = "+"; break;
                    case TAC_OP_SUB: op_str = "-"; break;
                    case TAC_OP_MUL: op_str = "*"; break;
                    case TAC_OP_DIV: op_str = "/"; break;
                    case TAC_OP_MOD: op_str = "%"; break;
                    case TAC_OP_EQ:  op_str = "=="; break;
                    case TAC_OP_NE:  op_str = "!="; break;
                    case TAC_OP_LT:  op_str = "<"; break;
                    case TAC_OP_GT:  op_str = ">"; break;
                    case TAC_OP_LE:  op_str = "<="; break;
                    case TAC_OP_GE:  op_str = ">="; break;
                    case TAC_OP_AND: op_str = "&&"; break;
                    case TAC_OP_OR:  op_str = "||"; break;
                    default: break;
                }
                fprintf(out, "%s = %s %s %s\n", curr->dest, curr->src1, op_str, curr->src2);
                break;
            }

            case TAC_OP_NOT:
                fprintf(out, "%s = !%s\n", curr->dest, curr->src1);
                break;

            case TAC_OP_NEG:
                fprintf(out, "%s = -%s\n", curr->dest, curr->src1);
                break;

            case TAC_OP_GOTO:
                fprintf(out, "goto %s\n", curr->dest);
                break;

            case TAC_OP_IF_GOTO:
                fprintf(out, "if %s goto %s\n", curr->src1, curr->src2);
                break;

            case TAC_OP_LABEL:
                fprintf(out, "%s:\n", curr->dest);
                break;

            case TAC_OP_PRINT:
                fprintf(out, "print %s\n", curr->src1);
                break;

            case TAC_OP_PRINTLN:
                if (curr->src1) {
                    fprintf(out, "println %s\n", curr->src1);
                } else {
                    fprintf(out, "println\n");
                }
                break;

            case TAC_OP_ARG:
                fprintf(out, "arg %s\n", curr->src1);
                break;

            case TAC_OP_PRINTF:
                fprintf(out, "printf %s\n", curr->src1);
                break;

            case TAC_OP_ITOF:
                fprintf(out, "%s = (float)%s\n", curr->dest, curr->src1);
                break;

            case TAC_OP_UNINIT:
                /* Internal VM slot lifecycle reset; intentionally omitted from TAC printout. */
                break;

            default:
                break;
        }
        curr = curr->next;
    }
}

void tac_list_free(TacList *list) {
    if (!list) {
        return;
    }
    free_instruction_chain(list->head);
    free(list);
}
