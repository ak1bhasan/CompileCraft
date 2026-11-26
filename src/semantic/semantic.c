/* ==============================================================================
 * CompileCraft - Semantic Analyzer Implementation (Milestone 6)
 * Enforces the six mandatory faculty semantic rules on baseline .mc ASTs.
 * ============================================================================== */

#include "semantic.h"
#include <ctype.h>
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
        case AST_TYPE_INT:     return TYPE_INT;
        case AST_TYPE_FLOAT:   return TYPE_FLOAT;
        case AST_TYPE_BOOL:    return TYPE_BOOL;
        case AST_TYPE_STRING:  return TYPE_STRING;
        case AST_TYPE_SCANNER: return TYPE_SCANNER;
        default:               return TYPE_UNKNOWN;
    }
}

static void report_undeclared_identifier(SemanticAnalyzer *sa, const char *name, int line) {
    int decl_line = 0;
    if (symbol_table_was_declared_in_exited_scope(sa->symtab, name, &decl_line)) {
        /* Rule 3: Scope violation */
        report_error(sa, line,
                     "Scope violation: Variable '%s' declared at line %d is not accessible in this scope.",
                     name, decl_line);
    } else {
        /* Rule 1: Undeclared variable use */
        report_error(sa, line,
                     "Variable '%s' is not declared.", name);
    }
}

static DataType scanner_method_return_type(const char *method_name) {
    if (!method_name) return TYPE_UNKNOWN;
    if (strcmp(method_name, "nextInt") == 0) return TYPE_INT;
    if (strcmp(method_name, "nextFloat") == 0) return TYPE_FLOAT;
    if (strcmp(method_name, "nextBoolean") == 0) return TYPE_BOOL;
    if (strcmp(method_name, "next") == 0 || strcmp(method_name, "nextLine") == 0) return TYPE_STRING;
    return TYPE_UNKNOWN;
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
                case AST_LIT_INT:    return TYPE_INT;
                case AST_LIT_FLOAT:  return TYPE_FLOAT;
                case AST_LIT_BOOL:   return TYPE_BOOL;
                case AST_LIT_STRING: return TYPE_STRING;
                default:             return TYPE_UNKNOWN;
            }
        }

        case AST_IDENTIFIER: {
            const char *name = expr->u.identifier.name;
            Symbol *sym = lookup_all_scopes(sa->symtab, name);
            if (sym) {
                return sym->type;
            }

            report_undeclared_identifier(sa, name, expr->line);
            return TYPE_UNKNOWN;
        }

        case AST_ADDR_OF:
            report_error(sa, expr->line,
                         "Invalid expression: Address-of '&' is only supported for scanf input targets.");
            if (expr->u.addr_of.operand) {
                analyze_expression(sa, expr->u.addr_of.operand);
            }
            return TYPE_UNKNOWN;

        case AST_SCANNER_NEW: {
            const char *cls = expr->u.scanner_new.class_name ? expr->u.scanner_new.class_name : "";
            const char *src = expr->u.scanner_new.source_name ? expr->u.scanner_new.source_name : "";
            if (strcmp(cls, "Scanner") != 0) {
                report_error(sa, expr->line,
                             "Unsupported constructor: 'new %s(%s)' is not supported (expected 'new Scanner(System.in)').",
                             cls, src);
                return TYPE_UNKNOWN;
            }
            if (strcmp(src, "System.in") != 0) {
                report_error(sa, expr->line,
                             "Invalid Scanner source '%s' (expected 'System.in').", src);
                return TYPE_UNKNOWN;
            }
            return TYPE_SCANNER;
        }

        case AST_INPUT_CALL: {
            const AstNode *recv = expr->u.input_call.receiver;
            const char *method = expr->u.input_call.method_name ? expr->u.input_call.method_name : "";
            if (!recv || recv->kind != AST_IDENTIFIER || !recv->u.identifier.name) {
                report_error(sa, expr->line, "Invalid Scanner method call target.");
                return TYPE_UNKNOWN;
            }
            const char *rname = recv->u.identifier.name;
            Symbol *sym = lookup_all_scopes(sa->symtab, rname);
            int ok = 1;
            if (!sym) {
                report_undeclared_identifier(sa, rname, recv->line > 0 ? recv->line : expr->line);
                ok = 0;
            } else if (sym->type != TYPE_SCANNER) {
                report_error(sa, expr->line,
                             "Invalid method call: Variable '%s' has type '%s', expected 'Scanner'.",
                             rname, datatype_to_string(sym->type));
                ok = 0;
            } else if (!sym->is_initialized) {
                report_error(sa, expr->line,
                             "Invalid Scanner use: Variable '%s' is not initialized with 'new Scanner(System.in)'.",
                             rname);
                ok = 0;
            }

            DataType ret = scanner_method_return_type(method);
            if (ret == TYPE_UNKNOWN) {
                report_error(sa, expr->line,
                             "Unsupported Scanner method '%s()' (supported: nextInt, nextFloat, nextBoolean, next, nextLine).",
                             method);
                return TYPE_UNKNOWN;
            }
            return ok ? ret : TYPE_UNKNOWN;
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
                if (op_type == TYPE_STRING) {
                    report_error(sa, expr->line,
                                 "Invalid expression: Unary negation '-' operator cannot be applied to string operand.");
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
                    if (left == TYPE_STRING || right == TYPE_STRING) {
                        report_error(sa, expr->line,
                                     "Invalid expression: Arithmetic operator cannot be applied to string operands.");
                        return TYPE_UNKNOWN;
                    }
                    if (left == TYPE_SCANNER || right == TYPE_SCANNER) {
                        report_error(sa, expr->line,
                                     "Invalid expression: Arithmetic operator cannot be applied to Scanner operands.");
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
                    if (left == TYPE_STRING || right == TYPE_STRING) {
                        report_error(sa, expr->line,
                                     "Invalid expression: Modulo operator '%%' requires integer operands, string is not allowed.");
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
                    if (left == TYPE_STRING || right == TYPE_STRING) {
                        report_error(sa, expr->line,
                                     "Invalid expression: Relational ordering operator requires numeric operands, got string.");
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
    int array_size = decl->u.var_decl.array_size;

    if (array_size > 0 && (decl_type != TYPE_STRING || array_size > 65536)) {
        report_error(sa, decl->line,
                     "Invalid array declaration for '%s': Char buffer size must be between 1 and 65536.",
                     name);
    }

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
            if (decl_type == TYPE_SCANNER && init_type != TYPE_SCANNER) {
                report_error(sa, decl->line,
                             "Type mismatch: Cannot initialize 'Scanner' variable with '%s' expression.",
                             datatype_to_string(init_type));
            } else if (init_type == TYPE_SCANNER && decl_type != TYPE_SCANNER) {
                report_error(sa, decl->line,
                             "Invalid assignment: Cannot assign 'Scanner' to '%s'.",
                             datatype_to_string(decl_type));
            } else if (decl_type == TYPE_BOOL && init_type != TYPE_BOOL) {
                report_error(sa, decl->line,
                             "Type mismatch: Cannot initialize 'bool' variable with '%s' expression.",
                             datatype_to_string(init_type));
            } else if (decl_type == TYPE_STRING && init_type != TYPE_STRING) {
                report_error(sa, decl->line,
                             "Type mismatch: Cannot initialize 'string' variable with '%s' expression.",
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
            } else if (init_type == TYPE_STRING &&
                       (decl_type == TYPE_INT || decl_type == TYPE_FLOAT || decl_type == TYPE_BOOL)) {
                report_error(sa, decl->line,
                             "Invalid assignment: Cannot assign 'string' to '%s'.",
                             datatype_to_string(decl_type));
            }
        }
    }

    /* Register symbol into current scope frame */
    symbol_table_insert_ext(sa->symtab,
                            name,
                            decl_type,
                            decl->line,
                            (array_size > 0) ? (size_t)array_size : 0u,
                            decl->u.var_decl.init != NULL);
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
        report_undeclared_identifier(sa, name, assign->line);
    }

    DataType val_type = analyze_expression(sa, assign->u.assign.value);

    /* If target was resolved and value has valid type, check type compatibility */
    if (sym && val_type != TYPE_UNKNOWN) {
        DataType target_type = sym->type;

        if (target_type == TYPE_STRING && sym->array_size > 0) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign directly to char array '%s'.",
                         name);
            return;
        }

        /* Rule 4 & 5: Type mismatch and invalid assignment checks */
        if (target_type == TYPE_SCANNER && val_type != TYPE_SCANNER) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign '%s' to 'Scanner'.",
                         datatype_to_string(val_type));
        } else if (val_type == TYPE_SCANNER && target_type != TYPE_SCANNER) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign 'Scanner' to '%s'.",
                         datatype_to_string(target_type));
        } else if (target_type == TYPE_BOOL && val_type != TYPE_BOOL) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign '%s' to 'bool'.",
                         datatype_to_string(val_type));
        } else if (target_type == TYPE_STRING && val_type != TYPE_STRING) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign '%s' to 'string'.",
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
        } else if (val_type == TYPE_STRING &&
                   (target_type == TYPE_INT || target_type == TYPE_FLOAT || target_type == TYPE_BOOL)) {
            report_error(sa, assign->line,
                         "Invalid assignment: Cannot assign 'string' to '%s'.",
                         datatype_to_string(target_type));
        } else if (target_type == TYPE_SCANNER && val_type == TYPE_SCANNER) {
            sym->is_initialized = true;
        }
    }
}

static void analyze_stmt_list(SemanticAnalyzer *sa, const AstNode *first) {
    const AstNode *curr = first;
    while (curr) {
        analyze_statement(sa, curr);
        curr = curr->next;
    }
}

static void analyze_block(SemanticAnalyzer *sa, const AstNode *block) {
    enter_scope(sa->symtab);
    analyze_stmt_list(sa, block->u.block.stmts);
    exit_scope(sa->symtab);
}

static DataType analyze_concat_expr(SemanticAnalyzer *sa, const AstNode *expr) {
    if (!expr) return TYPE_UNKNOWN;

    if (expr->kind == AST_BINARY_OP && expr->u.binary.op == AST_OP_ADD) {
        DataType left = analyze_concat_expr(sa, expr->u.binary.left);
        DataType right = analyze_concat_expr(sa, expr->u.binary.right);

        if (left == TYPE_UNKNOWN || right == TYPE_UNKNOWN) {
            return TYPE_UNKNOWN;
        }
        if (left == TYPE_SCANNER || right == TYPE_SCANNER) {
            report_error(sa, expr->line,
                         "Invalid expression: Cannot concatenate 'Scanner' handle.");
            return TYPE_UNKNOWN;
        }
        if (left == TYPE_STRING || right == TYPE_STRING) {
            return TYPE_STRING;
        }
        if (left == TYPE_BOOL || right == TYPE_BOOL) {
            report_error(sa, expr->line,
                         "Invalid expression: Arithmetic operator cannot be applied to boolean operands.");
            return TYPE_UNKNOWN;
        }
        return (left == TYPE_FLOAT || right == TYPE_FLOAT) ? TYPE_FLOAT : TYPE_INT;
    }

    return analyze_expression(sa, expr);
}

static void analyze_printf_output(SemanticAnalyzer *sa, const AstNode *stmt) {
    const AstNode *fmt_node = stmt->u.output_stmt.items;
    if (!fmt_node) {
        report_error(sa, stmt->line, "Invalid printf call: Expected a format string argument.");
        return;
    }

    int is_string_lit = (fmt_node->kind == AST_LITERAL &&
                         fmt_node->u.literal.lit_kind == AST_LIT_STRING);
    DataType fmt_type = analyze_expression(sa, fmt_node);
    const AstNode *curr_arg = fmt_node->next;

    if (!is_string_lit) {
        if (fmt_type != TYPE_UNKNOWN) {
            report_error(sa, fmt_node->line,
                         "Invalid printf format: First argument must be a string literal.");
        }
        while (curr_arg) {
            analyze_expression(sa, curr_arg);
            curr_arg = curr_arg->next;
        }
        return;
    }

    const char *s = fmt_node->u.literal.as.sval ? fmt_node->u.literal.as.sval : "";
    size_t len = strlen(s);
    size_t i = (len >= 2 && s[0] == '"' && s[len - 1] == '"') ? 1 : 0;
    size_t end = (len >= 2 && s[0] == '"' && s[len - 1] == '"') ? (len - 1) : len;
    int spec_aborted = 0;

    while (i < end) {
        if (s[i] == '\\') {
            if (i + 1 >= end) {
                report_error(sa, fmt_node->line,
                             "Invalid escape sequence at end of printf format string.");
                spec_aborted = 1;
                break;
            }
            char esc = s[i + 1];
            if (esc == '0') {
                break;
            }
            if (esc != 'n' && esc != 't' && esc != 'r' &&
                esc != '\\' && esc != '"' && esc != '\'') {
                report_error(sa, fmt_node->line,
                             "Invalid escape sequence '\\%c' in printf format string.", esc);
                spec_aborted = 1;
                break;
            }
            i += 2;
            continue;
        }

        if (s[i] == '%') {
            if (i + 1 >= end) {
                report_error(sa, fmt_node->line,
                             "Invalid printf format: Incomplete conversion specifier '%%' at end of format string.");
                spec_aborted = 1;
                break;
            }
            char spec = s[i + 1];
            if (spec == '%') {
                i += 2;
                continue;
            }

            DataType expected = TYPE_UNKNOWN;
            size_t advance = 2;
            if (spec == '.') {
                size_t j = i + 2;
                int prec = 0;
                int has_digits = 0;
                while (j < end && isdigit((unsigned char)s[j])) {
                    has_digits = 1;
                    if (prec <= 20) {
                        prec = prec * 10 + (s[j] - '0');
                    }
                    j++;
                }
                if (has_digits && j < end && s[j] == 'f' && prec <= 20) {
                    expected = TYPE_FLOAT;
                    advance = (j - i) + 1;
                } else {
                    report_error(sa, fmt_node->line,
                                 "Invalid printf format: Unsupported conversion specifier. Supported specifiers are %%d, %%f, %%.Nf, %%s, and %%%%.");
                    spec_aborted = 1;
                    break;
                }
            } else if (spec == 'd') {
                expected = TYPE_INT;
            } else if (spec == 'f') {
                expected = TYPE_FLOAT;
            } else if (spec == 's') {
                expected = TYPE_STRING;
            } else {
                report_error(sa, fmt_node->line,
                             "Invalid printf format: Unsupported conversion specifier '%%%c'. Supported specifiers are %%d, %%f, %%s, and %%%%.",
                             spec);
                spec_aborted = 1;
                break;
            }

            if (!curr_arg) {
                report_error(sa, fmt_node->line,
                             "Invalid printf call: Too few arguments for format specifier '%%%c'.",
                             spec == '.' ? 'f' : spec);
                spec_aborted = 1;
                break;
            }

            DataType arg_type = analyze_expression(sa, curr_arg);
            if (arg_type != TYPE_UNKNOWN && arg_type != expected) {
                report_error(sa, curr_arg->line,
                             "Invalid printf argument: Format specifier '%%%c' expects '%s', got '%s'.",
                             spec == '.' ? 'f' : spec, datatype_to_string(expected), datatype_to_string(arg_type));
            }
            curr_arg = curr_arg->next;
            i += advance;
            continue;
        }

        i++;
    }

    if (spec_aborted) {
        while (curr_arg) {
            analyze_expression(sa, curr_arg);
            curr_arg = curr_arg->next;
        }
    } else if (curr_arg != NULL) {
        int extra_line = curr_arg->line;
        while (curr_arg) {
            analyze_expression(sa, curr_arg);
            curr_arg = curr_arg->next;
        }
        report_error(sa, extra_line,
                     "Invalid printf call: Too many arguments supplied for format string.");
    }
}

static Symbol *resolve_input_variable(SemanticAnalyzer *sa, const AstNode *id_node, const char *ctx) {
    if (!id_node || id_node->kind != AST_IDENTIFIER || !id_node->u.identifier.name) {
        report_error(sa, id_node ? id_node->line : 0,
                     "Invalid %s target: Expected a variable identifier.", ctx);
        return NULL;
    }
    const char *name = id_node->u.identifier.name;
    Symbol *sym = lookup_all_scopes(sa->symtab, name);
    if (!sym) {
        report_undeclared_identifier(sa, name, id_node->line);
        return NULL;
    }
    return sym;
}

static void analyze_scanf_input(SemanticAnalyzer *sa, const AstNode *stmt) {
    const AstNode *fmt_node = stmt->u.input_stmt.items;
    if (!fmt_node) {
        report_error(sa, stmt->line, "Invalid scanf call: Expected a format string argument.");
        return;
    }

    int is_string_lit = (fmt_node->kind == AST_LITERAL &&
                         fmt_node->u.literal.lit_kind == AST_LIT_STRING);
    const AstNode *curr_arg = fmt_node->next;

    if (!is_string_lit) {
        DataType fmt_type = analyze_expression(sa, fmt_node);
        if (fmt_type != TYPE_UNKNOWN) {
            report_error(sa, fmt_node->line,
                         "Invalid scanf format: First argument must be a string literal.");
        }
        return;
    }

    const char *s = fmt_node->u.literal.as.sval ? fmt_node->u.literal.as.sval : "";
    size_t len = strlen(s);
    size_t i = (len >= 2 && s[0] == '"' && s[len - 1] == '"') ? 1 : 0;
    size_t end = (len >= 2 && s[0] == '"' && s[len - 1] == '"') ? (len - 1) : len;
    int spec_aborted = 0;

    while (i < end) {
        if (s[i] == '\\') {
            if (i + 1 >= end) {
                report_error(sa, fmt_node->line,
                             "Invalid escape sequence at end of scanf format string.");
                spec_aborted = 1;
                break;
            }
            char esc = s[i + 1];
            if (esc == '0') {
                break;
            }
            if (esc != 'n' && esc != 't' && esc != 'r' &&
                esc != '\\' && esc != '"' && esc != '\'') {
                report_error(sa, fmt_node->line,
                             "Invalid escape sequence '\\%c' in scanf format string.", esc);
                spec_aborted = 1;
                break;
            }
            i += 2;
            continue;
        }

        if (s[i] != '%') {
            i++;
            continue;
        }

        if (i + 1 >= end) {
            report_error(sa, fmt_node->line,
                         "Invalid scanf format: Incomplete conversion specifier '%%' at end of format string.");
            spec_aborted = 1;
            break;
        }
        if (s[i + 1] == '%') {
            i += 2;
            continue;
        }

        size_t j = i + 1;
        int has_width = 0;
        size_t width_val = 0;
        while (j < end && isdigit((unsigned char)s[j])) {
            has_width = 1;
            if (width_val <= 65536) {
                width_val = width_val * 10 + (size_t)(s[j] - '0');
            }
            j++;
        }

        if (j >= end) {
            report_error(sa, fmt_node->line,
                         "Invalid scanf format: Incomplete conversion specifier at end of format string.");
            spec_aborted = 1;
            break;
        }

        char spec = s[j];
        if (spec != 'd' && spec != 'f' && spec != 's') {
            report_error(sa, fmt_node->line,
                         "Invalid scanf format: Unsupported conversion specifier '%%%c'. Supported specifiers are %%d, %%f, %%s, %%Ns, and %%%%.",
                         spec);
            spec_aborted = 1;
            break;
        }

        if (has_width && width_val == 0) {
            report_error(sa, fmt_node->line,
                         "Invalid scanf format: Field width must be positive ('%%0%c' is invalid).",
                         spec);
            spec_aborted = 1;
            break;
        }
        if (has_width && spec != 's') {
            report_error(sa, fmt_node->line,
                         "Invalid scanf format: Field width is only supported on '%%s' (got '%%%lu%c').",
                         (unsigned long)width_val, spec);
            spec_aborted = 1;
            break;
        }

        if (!curr_arg) {
            report_error(sa, fmt_node->line,
                         "Invalid scanf call: Too few arguments for format specifier '%%%c'.", spec);
            spec_aborted = 1;
            break;
        }

        if (spec == 's') {
            if (curr_arg->kind == AST_ADDR_OF) {
                report_error(sa, curr_arg->line,
                             "Invalid scanf argument: Format specifier '%%s' expects string buffer variable without '&'.");
            } else {
                Symbol *sym = resolve_input_variable(sa, curr_arg, "scanf");
                if (sym) {
                    if (sym->type != TYPE_STRING || sym->array_size == 0) {
                        report_error(sa, curr_arg->line,
                                     "Invalid scanf argument: Format specifier '%%s' expects char array variable, got '%s'.",
                                     datatype_to_string(sym->type));
                    } else if (sym->array_size < 2) {
                        report_error(sa, curr_arg->line,
                                     "Invalid scanf argument: Char array '%s[%lu]' has zero writable capacity.",
                                     sym->name, (unsigned long)sym->array_size);
                    } else if (has_width && width_val >= sym->array_size) {
                        report_error(sa, curr_arg->line,
                                     "Invalid scanf argument: Field width '%%%lus' exceeds capacity of char array '%s[%lu]' (max %lu).",
                                     (unsigned long)width_val, sym->name,
                                     (unsigned long)sym->array_size,
                                     (unsigned long)(sym->array_size - 1));
                    }
                }
            }
        } else {
            DataType expected = (spec == 'd') ? TYPE_INT : TYPE_FLOAT;
            if (curr_arg->kind != AST_ADDR_OF) {
                report_error(sa, curr_arg->line,
                             "Invalid scanf argument: Format specifier '%%%c' expects '&<%s>' address-of variable.",
                             spec, datatype_to_string(expected));
                if (curr_arg->kind == AST_IDENTIFIER) {
                    resolve_input_variable(sa, curr_arg, "scanf");
                }
            } else {
                const AstNode *op = curr_arg->u.addr_of.operand;
                if (!op || op->kind != AST_IDENTIFIER) {
                    report_error(sa, curr_arg->line,
                                 "Invalid scanf argument: Address-of '&' target must be a variable identifier.");
                } else {
                    Symbol *sym = resolve_input_variable(sa, op, "scanf");
                    if (sym && sym->type != expected) {
                        report_error(sa, curr_arg->line,
                                     "Invalid scanf argument: Format specifier '%%%c' expects '&%s', got '&%s'.",
                                     spec, datatype_to_string(expected), datatype_to_string(sym->type));
                    }
                }
            }
        }

        curr_arg = curr_arg->next;
        i = j + 1;
    }

    if (!spec_aborted && curr_arg != NULL) {
        report_error(sa, curr_arg->line,
                     "Invalid scanf call: Too many arguments supplied for format string.");
    }
}

static void analyze_cin_input(SemanticAnalyzer *sa, const AstNode *stmt) {
    const AstNode *item = stmt->u.input_stmt.items;
    if (!item) {
        report_error(sa, stmt->line, "Invalid cin statement: Expected input variable after '>>'.");
        return;
    }
    while (item) {
        if (item->kind != AST_IDENTIFIER) {
            report_error(sa, item->line > 0 ? item->line : stmt->line,
                         "Invalid input target: 'cin >>' requires a variable identifier.");
            analyze_expression(sa, item);
        } else {
            Symbol *sym = resolve_input_variable(sa, item, "cin");
            if (sym && sym->type != TYPE_INT && sym->type != TYPE_FLOAT &&
                sym->type != TYPE_BOOL && sym->type != TYPE_STRING) {
                report_error(sa, item->line,
                             "Invalid input target: 'cin >>' does not support variable '%s' of type '%s'.",
                             sym->name, datatype_to_string(sym->type));
            }
        }
        item = item->next;
    }
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

        case AST_SEQ:
            analyze_stmt_list(sa, stmt->u.seq.stmts);
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

        case AST_OUTPUT: {
            if (stmt->u.output_stmt.mode == AST_OUTPUT_PRINTF) {
                analyze_printf_output(sa, stmt);
            } else if (stmt->u.output_stmt.mode == AST_OUTPUT_CONCAT) {
                const AstNode *item = stmt->u.output_stmt.items;
                while (item) {
                    DataType t = analyze_concat_expr(sa, item);
                    if (t == TYPE_SCANNER) {
                        report_error(sa, item->line,
                                     "Invalid output expression: Cannot print 'Scanner' handle.");
                    }
                    item = item->next;
                }
            } else {
                const AstNode *item = stmt->u.output_stmt.items;
                while (item) {
                    DataType t = analyze_expression(sa, item);
                    if (t == TYPE_SCANNER) {
                        report_error(sa, item->line,
                                     "Invalid output expression: Cannot print 'Scanner' handle.");
                    }
                    item = item->next;
                }
            }
            break;
        }

        case AST_INPUT:
            if (stmt->u.input_stmt.mode == AST_INPUT_CIN) {
                analyze_cin_input(sa, stmt);
            } else {
                analyze_scanf_input(sa, stmt);
            }
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
