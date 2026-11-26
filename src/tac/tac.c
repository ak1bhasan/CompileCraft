/* ==============================================================================
 * CompileCraft - Three-Address Code (TAC) Generation Implementation (Milestone 7)
 *
 * Logical && / ||: eager value evaluation into temporaries (DEC-07 still OPEN for
 * short-circuit operand evaluation). Control-flow statements already use labels
 * and conditional jumps around statement bodies.
 * ============================================================================== */

#include "tac.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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
    snprintf(buf, sizeof(buf), "%g", val);
    return duplicate_str(gen, buf);
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
    gen->failed = 0;
    return gen;
}

void tac_generator_destroy(TacGenerator *gen) {
    if (!gen) {
        return;
    }
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

    switch (expr->kind) {
        case AST_LITERAL: {
            switch (expr->u.literal.lit_kind) {
                case AST_LIT_INT:
                    return format_int_literal(gen, expr->u.literal.as.ival);
                case AST_LIT_FLOAT:
                    return format_float_literal(gen, expr->u.literal.as.fval);
                case AST_LIT_BOOL:
                    return duplicate_str(gen, expr->u.literal.as.bval ? "true" : "false");
                default:
                    mark_failed(gen);
                    return NULL;
            }
        }

        case AST_IDENTIFIER: {
            if (!expr->u.identifier.name) {
                mark_failed(gen);
                return NULL;
            }
            return duplicate_str(gen, expr->u.identifier.name);
        }

        case AST_UNARY_OP: {
            char *op_val = generate_expr(gen, expr->u.unary.operand);
            if (!op_val) {
                return NULL;
            }
            char *temp = new_temp(gen);
            if (!temp) {
                free(op_val);
                return NULL;
            }

            TacOpcode code = (expr->u.unary.op == AST_OP_NOT) ? TAC_OP_NOT : TAC_OP_NEG;
            if (!emit_instr(gen, code, temp, op_val, NULL)) {
                free(op_val);
                free(temp);
                return NULL;
            }

            free(op_val);
            return temp;
        }

        case AST_BINARY_OP: {
            char *left_val = generate_expr(gen, expr->u.binary.left);
            if (!left_val) {
                return NULL;
            }
            char *right_val = generate_expr(gen, expr->u.binary.right);
            if (!right_val) {
                free(left_val);
                return NULL;
            }
            char *temp = new_temp(gen);
            if (!temp) {
                free(left_val);
                free(right_val);
                return NULL;
            }

            TacOpcode code = binop_to_tac_opcode(expr->u.binary.op);
            if (!emit_instr(gen, code, temp, left_val, right_val)) {
                free(left_val);
                free(right_val);
                free(temp);
                return NULL;
            }

            free(left_val);
            free(right_val);
            return temp;
        }

        default:
            mark_failed(gen);
            return NULL;
    }
}

static void generate_statement(TacGenerator *gen, const AstNode *stmt);

static void generate_block(TacGenerator *gen, const AstNode *block) {
    if (!gen || gen->failed || !block) {
        return;
    }
    const AstNode *curr = block->u.block.stmts;
    while (curr && !gen->failed) {
        generate_statement(gen, curr);
        curr = curr->next;
    }
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

    switch (stmt->kind) {
        case AST_VAR_DECL: {
            if (stmt->u.var_decl.init) {
                char *init_val = generate_expr(gen, stmt->u.var_decl.init);
                if (!init_val || !stmt->u.var_decl.name) {
                    free(init_val);
                    mark_failed(gen);
                    return;
                }
                if (!emit_instr(
                        gen,
                        TAC_OP_ASSIGN,
                        stmt->u.var_decl.name->u.identifier.name,
                        init_val,
                        NULL)) {
                    free(init_val);
                    return;
                }
                free(init_val);
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
            if (!emit_instr(
                    gen,
                    TAC_OP_ASSIGN,
                    stmt->u.assign.target->u.identifier.name,
                    val,
                    NULL)) {
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

        default:
            break;
    }
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
