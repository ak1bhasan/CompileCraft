/* ==============================================================================
 * CompileCraft - Semantic Analyzer Implementation (Milestone 6)
 * Enforces the six mandatory faculty semantic rules on baseline .mc ASTs.
 * ============================================================================== */

#include "semantic.h"
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <string.h>

static void report_error(SemanticAnalyzer *sa, int line, const char *fmt, ...) {
    sa->error_count++;
    FILE *out = sa->out ? sa->out : stderr;
    fprintf(out, "Semantic Error at line %d: ", line);

    va_list args;
    va_start(args, fmt);
    vfprintf(out, fmt, args);
    va_end(args);

    fprintf(out, "\n");
}

static DataType ast_type_to_data_type(AstTypeTag tag) {
    switch (tag) {
        case AST_TYPE_INT:   return TYPE_INT;
        case AST_TYPE_FLOAT: return TYPE_FLOAT;
        case AST_TYPE_BOOL:  return TYPE_BOOL;
        default:             return TYPE_UNKNOWN;
    }
}

SemanticAnalyzer *semantic_analyzer_create(void) {
    SemanticAnalyzer *sa = (SemanticAnalyzer *)malloc(sizeof(SemanticAnalyzer));
    if (!sa) return NULL;

    sa->symtab = symbol_table_create();
    if (!sa->symtab) {
        free(sa);
        return NULL;
    }

    sa->error_count = 0;
    sa->out = stderr;
    return sa;
}

void semantic_analyzer_destroy(SemanticAnalyzer *sa) {
    if (!sa) return;
    if (sa->symtab) {
        symbol_table_destroy(sa->symtab);
        sa->symtab = NULL;
    }
    free(sa);
}

/* Forward declaration for recursive statement analysis */
static void analyze_statement(SemanticAnalyzer *sa, const AstNode *stmt);

static DataType analyze_expression(SemanticAnalyzer *sa, const AstNode *expr) {
    if (!expr) return TYPE_UNKNOWN;

    switch (expr->kind) {
        case AST_LITERAL: {
            switch (expr->u.literal.lit_kind) {
                case AST_LIT_INT:   return TYPE_INT;
                case AST_LIT_FLOAT: return TYPE_FLOAT;
                case AST_LIT_BOOL:  return TYPE_BOOL;
                default:            return TYPE_UNKNOWN;
            }
        }

        case AST_IDENTIFIER: {
            const char *name = expr->u.identifier.name;
            Symbol *sym = lookup_all_scopes(sa->symtab, name);
            if (sym) {
                return sym->type;
            }

            /* Variable not found in active scopes. Check if declared in an exited scope. */
            int decl_line = 0;
            if (symbol_table_was_declared_in_exited_scope(sa->symtab, name, &decl_line)) {
                /* Rule 3: Scope violation */
                report_error(sa, expr->line,
                             "Scope violation: Variable '%s' declared at line %d is not accessible in this scope.",
                             name, decl_line);
            } else {
                /* Rule 1: Undeclared variable use */
                report_error(sa, expr->line,
                             "Variable '%s' is not declared.", name);
            }
            return TYPE_UNKNOWN;
        }

        case AST_UNARY_OP: {
            DataType op_type = analyze_expression(sa, expr->u.unary.operand);
            if (op_type == TYPE_UNKNOWN) return TYPE_UNKNOWN;

            if (expr->u.unary.op == AST_OP_NOT) {
                /* Rule 6: Logical NOT requires boolean operand */
                if (op_type != TYPE_BOOL) {
                    report_error(sa, expr->line,
                                 "Invalid expression: Logical NOT '!' operator requires boolean operand, got '%s'.",
                                 datatype_to_string(op_type));
                    return TYPE_UNKNOWN;
                }
                return TYPE_BOOL;
            } else if (expr->u.unary.op == AST_OP_NEG) {
                /* Rule 6: Unary minus requires numeric operand */
                if (op_type == TYPE_BOOL) {
                    report_error(sa, expr->line,
                                 "Invalid expression: Unary negation '-' operator cannot be applied to boolean operand.");
                    return TYPE_UNKNOWN;
                }
                return op_type;
            }
            return TYPE_UNKNOWN;
        }

        case AST_BINARY_OP: {
            DataType left = analyze_expression(sa, expr->u.binary.left);
            DataType right = analyze_expression(sa, expr->u.binary.right);

            if (left == TYPE_UNKNOWN || right == TYPE_UNKNOWN) {
                return TYPE_UNKNOWN;
            }

            switch (expr->u.binary.op) {
                case AST_OP_ADD:
                case AST_OP_SUB:
                case AST_OP_MUL:
                case AST_OP_DIV: {
                    /* Rule 6: Arithmetic operators require numeric operands */
                    if (left == TYPE_BOOL || right == TYPE_BOOL) {
                        report_error(sa, expr->line,
                                     "Invalid expression: Arithmetic operator cannot be applied to boolean operands.");
                        return TYPE_UNKNOWN;
                    }
                    /* Numeric promotion: float if either is float, otherwise int */
                    if (left == TYPE_FLOAT || right == TYPE_FLOAT) {
                        return TYPE_FLOAT;
                    }
                    return TYPE_INT;
                }

                case AST_OP_MOD: {
                    /* DEC-03 & Rule 6: Modulo restricted strictly to integer operands */
                    if (left == TYPE_BOOL || right == TYPE_BOOL) {
                        report_error(sa, expr->line,
                                     "Invalid expression: Modulo operator '%%' cannot be applied to boolean operands.");
                        return TYPE_UNKNOWN;
                    }
                    if (left == TYPE_FLOAT || right == TYPE_FLOAT) {
                        report_error(sa, expr->line,
                                     "Invalid expression: Modulo operator '%%' requires integer operands, floating-point is not allowed.");
                        return TYPE_UNKNOWN;
                    }
                    return TYPE_INT;
                }

                case AST_OP_LT:
                case AST_OP_GT:
                case AST_OP_LE:
                case AST_OP_GE: {
                    /* DEC-04 & Rule 6: Relational ordering requires numeric operands */
                    if (left == TYPE_BOOL || right == TYPE_BOOL) {
                        report_error(sa, expr->line,
                                     "Invalid expression: Relational ordering operator requires numeric operands, got boolean.");
                        return TYPE_UNKNOWN;
                    }
                    return TYPE_BOOL;
                }

                case AST_OP_EQ:
                case AST_OP_NE: {
                    /* DEC-04: Equality allowed for (bool, bool) or (numeric, numeric) */
                    bool left_num = (left == TYPE_INT || left == TYPE_FLOAT);
                    bool right_num = (right == TYPE_INT || right == TYPE_FLOAT);

                    if (left == TYPE_BOOL && right == TYPE_BOOL) {
                        return TYPE_BOOL;
                    }
                    if (left_num && right_num) {
                        return TYPE_BOOL;
                    }

                    /* Rule 4: Type mismatch comparing bool with numeric */
                    report_error(sa, expr->line,
                                 "Type mismatch: Cannot compare '%s' with '%s' using equality operator.",
                                 datatype_to_string(left), datatype_to_string(right));
                    return TYPE_UNKNOWN;
                }

                case AST_OP_AND:
                case AST_OP_OR: {
                    /* Rule 6: Logical operators require boolean operands */
                    if (left != TYPE_BOOL || right != TYPE_BOOL) {
                        report_error(sa, expr->line,
                                     "Invalid expression: Logical operator requires boolean operands, got '%s' and '%s'.",
                                     datatype_to_string(left), datatype_to_string(right));
                        return TYPE_UNKNOWN;
                    }
                    return TYPE_BOOL;
                }

                default:
                    return TYPE_UNKNOWN;
            }
        }

        default:
            return TYPE_UNKNOWN;
    }
}

static void analyze_var_decl(SemanticAnalyzer *sa, const AstNode *decl) {
    const char *name = decl->u.var_decl.name ? decl->u.var_decl.name->u.identifier.name : NULL;
    if (!name) return;

    DataType decl_type = ast_type_to_data_type(decl->u.var_decl.type_tag);

    /* Rule 2: Redeclaration in same scope */
    if (lookup_current_scope(sa->symtab, name) != NULL) {
        report_error(sa, decl->line,
                     "Variable '%s' is already declared in this scope.", name);
        return;
    }

    /* Analyze optional initializing expression */
    if (decl->u.var_decl.init) {
        DataType init_type = analyze_expression(sa, decl->u.var_decl.init);
        if (init_type != TYPE_UNKNOWN) {
            /* Rule 4 & 5: Check assignment compatibility */
            if (decl_type == TYPE_BOOL && init_type != TYPE_BOOL) {
                report_error(sa, decl->line,
                             "Type mismatch: Cannot initialize 'bool' variable with '%s' expression.",
                             datatype_to_string(init_type));
            } else if (decl_type == TYPE_INT && init_type == TYPE_FLOAT) {
                report_error(sa, decl->line,
                             "Invalid assignment: Cannot assign 'float' to 'int' without explicit cast.");
            } else if (decl_type == TYPE_INT && init_type == TYPE_BOOL) {
                report_error(sa, decl->line,
                             "Invalid assignment: Cannot assign 'bool' to 'int'.");
            } else if (decl_type == TYPE_FLOAT && init_type == TYPE_BOOL) {
                report_error(sa, decl->line,
                             "Invalid assignment: Cannot assign 'bool' to 'float'.");
            }
        }
    }

    /* Register symbol into current scope frame */
    symbol_table_insert(sa->symtab, name, decl_type, decl->line);
}

static void analyze_assignment(SemanticAnalyzer *sa, const AstNode *assign) {
    const AstNode *target = assign->u.assign.target;
    if (!target || target->kind != AST_IDENTIFIER) {
        report_error(sa, assign->line, "Invalid assignment: Assignment target must be a variable identifier.");
        return;
    }

    const char *name = target->u.identifier.name;
    Symbol *sym = lookup_all_scopes(sa->symtab, name);
    if (!sym) {
        int decl_line = 0;
        if (symbol_table_was_declared_in_exited_scope(sa->symtab, name, &decl_line)) {
            /* Rule 3: Scope violation */
            report_error(sa, assign->line,
                         "Scope violation: Variable '%s' declared at line %d is not accessible in this scope.",
                         name, decl_line);
        } else {
            /* Rule 1: Undeclared variable use */
            report_error(sa, assign->line,
                         "Variable '%s' is not declared.", name);
        }
    }

    DataType val_type = analyze_expression(sa, assign->u.assign.value);

    /* If target was resolved and value has valid type, check type compatibility */
    if (sym && val_type != TYPE_UNKNOWN) {
        DataType target_type = sym->type;

        /* Rule 4 & 5: Type mismatch and invalid assignment checks */
        if (target_type == TYPE_BOOL && val_type != TYPE_BOOL) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign '%s' to 'bool'.",
                         datatype_to_string(val_type));
        } else if (target_type == TYPE_INT && val_type == TYPE_FLOAT) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign 'float' to 'int' without explicit cast.");
        } else if (target_type == TYPE_INT && val_type == TYPE_BOOL) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign 'bool' to 'int'.");
        } else if (target_type == TYPE_FLOAT && val_type == TYPE_BOOL) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign 'bool' to 'float'.");
        }
    }
}

static void analyze_block(SemanticAnalyzer *sa, const AstNode *block) {
    enter_scope(sa->symtab);

    const AstNode *curr = block->u.block.stmts;
    while (curr) {
        analyze_statement(sa, curr);
        curr = curr->next;
    }

    exit_scope(sa->symtab);
}

static void analyze_if(SemanticAnalyzer *sa, const AstNode *stmt) {
    DataType cond_type = analyze_expression(sa, stmt->u.if_stmt.cond);
    if (cond_type != TYPE_UNKNOWN && cond_type != TYPE_BOOL) {
        /* Rule 6: Condition must be boolean */
        report_error(sa, stmt->line,
                     "Invalid expression: 'if' condition must be boolean, got '%s'.",
                     datatype_to_string(cond_type));
    }

    if (stmt->u.if_stmt.then_branch) {
        analyze_statement(sa, stmt->u.if_stmt.then_branch);
    }
    if (stmt->u.if_stmt.else_branch) {
        analyze_statement(sa, stmt->u.if_stmt.else_branch);
    }
}

static void analyze_while(SemanticAnalyzer *sa, const AstNode *stmt) {
    DataType cond_type = analyze_expression(sa, stmt->u.while_stmt.cond);
    if (cond_type != TYPE_UNKNOWN && cond_type != TYPE_BOOL) {
        /* Rule 6: Condition must be boolean */
        report_error(sa, stmt->line,
                     "Invalid expression: 'while' condition must be boolean, got '%s'.",
                     datatype_to_string(cond_type));
    }

    if (stmt->u.while_stmt.body) {
        analyze_statement(sa, stmt->u.while_stmt.body);
    }
}

static void analyze_statement(SemanticAnalyzer *sa, const AstNode *stmt) {
    if (!stmt) return;

    switch (stmt->kind) {
        case AST_VAR_DECL:
            analyze_var_decl(sa, stmt);
            break;

        case AST_ASSIGN:
            analyze_assignment(sa, stmt);
            break;

        case AST_BLOCK:
            analyze_block(sa, stmt);
            break;

        case AST_IF:
            analyze_if(sa, stmt);
            break;

        case AST_WHILE:
            analyze_while(sa, stmt);
            break;

        case AST_PRINT:
            analyze_expression(sa, stmt->u.print_stmt.expr);
            break;

        case AST_EXPR_STMT:
            analyze_expression(sa, stmt->u.expr_stmt.expr);
            break;

        case AST_EMPTY_STMT:
            /* Semicolon-only statement: no semantic operation */
            break;

        default:
            break;
    }
}

int semantic_analyze(SemanticAnalyzer *sa, const AstNode *root) {
    if (!sa || !root) return -1;

    if (root->kind != AST_PROGRAM) {
        report_error(sa, root->line, "Root AST node is not a program node.");
        return sa->error_count;
    }

    const AstNode *curr = root->u.program.stmts;
    while (curr) {
        analyze_statement(sa, curr);
        curr = curr->next;
    }

    return sa->error_count;
}

int semantic_check_ast(const AstNode *root) {
    SemanticAnalyzer *sa = semantic_analyzer_create();
    if (!sa) return -1;

    int errors = semantic_analyze(sa, root);
    semantic_analyzer_destroy(sa);
    return errors;
}
