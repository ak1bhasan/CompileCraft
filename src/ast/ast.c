/* ==============================================================================
 * CompileCraft - Abstract Syntax Tree Implementation (Milestone 4.1)
 * Design authority: docs/ast.md
 * ============================================================================== */

#include "ast.h"

#include <stdlib.h>
#include <string.h>

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

static AstNode *ast_node_new(AstKind kind, int line, int column) {
    AstNode *node = (AstNode *)calloc(1, sizeof(AstNode));
    if (node == NULL) {
        return NULL;
    }
    node->kind = kind;
    node->line = line;
    node->column = column;
    node->next = NULL;
    node->in_stmt_list = 0;
    return node;
}

static void ast_fail_free_children(AstNode *a, AstNode *b, AstNode *c) {
    ast_free(a);
    ast_free(b);
    ast_free(c);
}

static int ast_is_identifier(const AstNode *node) {
    return node != NULL && node->kind == AST_IDENTIFIER;
}

static const char *ast_type_tag_name(AstTypeTag tag) {
    switch (tag) {
        case AST_TYPE_INT:   return "int";
        case AST_TYPE_FLOAT: return "float";
        case AST_TYPE_BOOL:  return "bool";
        default:             return "?";
    }
}

static const char *ast_binop_name(AstBinOp op) {
    switch (op) {
        case AST_OP_ADD: return "+";
        case AST_OP_SUB: return "-";
        case AST_OP_MUL: return "*";
        case AST_OP_DIV: return "/";
        case AST_OP_MOD: return "%";
        case AST_OP_EQ:  return "==";
        case AST_OP_NE:  return "!=";
        case AST_OP_LT:  return "<";
        case AST_OP_GT:  return ">";
        case AST_OP_LE:  return "<=";
        case AST_OP_GE:  return ">=";
        case AST_OP_AND: return "&&";
        case AST_OP_OR:  return "||";
        default:         return "?";
    }
}

static const char *ast_unop_name(AstUnOp op) {
    switch (op) {
        case AST_OP_NOT: return "!";
        case AST_OP_NEG: return "-";
        default:         return "?";
    }
}

static void ast_print_spaces(FILE *out, int depth) {
    int i;
    for (i = 0; i < depth; i++) {
        fputs("  ", out);
    }
}

/* -------------------------------------------------------------------------- */
/* Statement lists                                                            */
/* -------------------------------------------------------------------------- */

AstList ast_list_empty(void) {
    AstList list;
    list.head = NULL;
    list.tail = NULL;
    return list;
}

int ast_list_append(AstList *list, AstNode *stmt) {
    if (list == NULL || stmt == NULL) {
        return 0;
    }

    /* Already owned by this or another statement list (covers tails and
     * sole members where next == NULL). Caller keeps ownership. */
    if (stmt->in_stmt_list) {
        return 0;
    }

    /* Defensive: chained without membership flag — do not link. */
    if (stmt->next != NULL) {
        return 0;
    }

    if (list->head == NULL) {
        list->head = stmt;
        list->tail = stmt;
        stmt->next = NULL;
        stmt->in_stmt_list = 1;
        return 1;
    }

    list->tail->next = stmt;
    list->tail = stmt;
    stmt->next = NULL;
    stmt->in_stmt_list = 1;
    return 1;
}

AstNode *ast_list_head(AstList list) {
    return list.head;
}

/* -------------------------------------------------------------------------- */
/* Constructors                                                               */
/* -------------------------------------------------------------------------- */

AstNode *ast_program(AstList stmts, int line, int column) {
    AstNode *node = ast_node_new(AST_PROGRAM, line, column);
    if (node == NULL) {
        ast_free(stmts.head);
        return NULL;
    }
    node->u.program.stmts = stmts.head;
    node->u.program.stmts_tail = stmts.tail;
    return node;
}

AstNode *ast_block(AstList stmts, int line, int column) {
    AstNode *node = ast_node_new(AST_BLOCK, line, column);
    if (node == NULL) {
        ast_free(stmts.head);
        return NULL;
    }
    node->u.block.stmts = stmts.head;
    node->u.block.stmts_tail = stmts.tail;
    return node;
}

AstNode *ast_var_decl(AstTypeTag type_tag, AstNode *name, AstNode *init,
                      int line, int column) {
    AstNode *node;

    if (!ast_is_identifier(name) || name->next != NULL) {
        ast_fail_free_children(name, init, NULL);
        return NULL;
    }
    if (init != NULL && init->next != NULL) {
        ast_fail_free_children(name, init, NULL);
        return NULL;
    }

    node = ast_node_new(AST_VAR_DECL, line, column);
    if (node == NULL) {
        ast_fail_free_children(name, init, NULL);
        return NULL;
    }

    node->u.var_decl.type_tag = type_tag;
    node->u.var_decl.name = name;
    node->u.var_decl.init = init;
    return node;
}

AstNode *ast_assign(AstNode *target, AstNode *value, int line, int column) {
    AstNode *node;

    if (!ast_is_identifier(target) || target->next != NULL ||
        value == NULL || value->next != NULL) {
        ast_fail_free_children(target, value, NULL);
        return NULL;
    }

    node = ast_node_new(AST_ASSIGN, line, column);
    if (node == NULL) {
        ast_fail_free_children(target, value, NULL);
        return NULL;
    }

    node->u.assign.target = target;
    node->u.assign.value = value;
    return node;
}

AstNode *ast_expr_stmt(AstNode *expr, int line, int column) {
    AstNode *node;

    if (expr == NULL || expr->next != NULL) {
        ast_free(expr);
        return NULL;
    }

    node = ast_node_new(AST_EXPR_STMT, line, column);
    if (node == NULL) {
        ast_free(expr);
        return NULL;
    }

    node->u.expr_stmt.expr = expr;
    return node;
}

AstNode *ast_empty_stmt(int line, int column) {
    return ast_node_new(AST_EMPTY_STMT, line, column);
}

AstNode *ast_if(AstNode *cond, AstNode *then_branch, AstNode *else_branch,
                int line, int column) {
    AstNode *node;

    if (cond == NULL || then_branch == NULL ||
        cond->next != NULL || then_branch->next != NULL ||
        (else_branch != NULL && else_branch->next != NULL)) {
        ast_fail_free_children(cond, then_branch, else_branch);
        return NULL;
    }

    node = ast_node_new(AST_IF, line, column);
    if (node == NULL) {
        ast_fail_free_children(cond, then_branch, else_branch);
        return NULL;
    }

    node->u.if_stmt.cond = cond;
    node->u.if_stmt.then_branch = then_branch;
    node->u.if_stmt.else_branch = else_branch;
    return node;
}

AstNode *ast_while(AstNode *cond, AstNode *body, int line, int column) {
    AstNode *node;

    if (cond == NULL || body == NULL ||
        cond->next != NULL || body->next != NULL) {
        ast_fail_free_children(cond, body, NULL);
        return NULL;
    }

    node = ast_node_new(AST_WHILE, line, column);
    if (node == NULL) {
        ast_fail_free_children(cond, body, NULL);
        return NULL;
    }

    node->u.while_stmt.cond = cond;
    node->u.while_stmt.body = body;
    return node;
}

AstNode *ast_print_stmt(AstNode *expr, int line, int column) {
    AstNode *node;

    if (expr == NULL || expr->next != NULL) {
        ast_free(expr);
        return NULL;
    }

    node = ast_node_new(AST_PRINT, line, column);
    if (node == NULL) {
        ast_free(expr);
        return NULL;
    }

    node->u.print_stmt.expr = expr;
    return node;
}

AstNode *ast_binary(AstBinOp op, AstNode *left, AstNode *right,
                    int line, int column) {
    AstNode *node;

    if (left == NULL || right == NULL ||
        left->next != NULL || right->next != NULL) {
        ast_fail_free_children(left, right, NULL);
        return NULL;
    }

    node = ast_node_new(AST_BINARY_OP, line, column);
    if (node == NULL) {
        ast_fail_free_children(left, right, NULL);
        return NULL;
    }

    node->u.binary.op = op;
    node->u.binary.left = left;
    node->u.binary.right = right;
    return node;
}

AstNode *ast_unary(AstUnOp op, AstNode *operand, int line, int column) {
    AstNode *node;

    if (operand == NULL || operand->next != NULL) {
        ast_free(operand);
        return NULL;
    }

    node = ast_node_new(AST_UNARY_OP, line, column);
    if (node == NULL) {
        ast_free(operand);
        return NULL;
    }

    node->u.unary.op = op;
    node->u.unary.operand = operand;
    return node;
}

AstNode *ast_identifier(char *name, int line, int column) {
    AstNode *node;

    if (name == NULL) {
        return NULL;
    }

    node = ast_node_new(AST_IDENTIFIER, line, column);
    if (node == NULL) {
        free(name);
        return NULL;
    }

    node->u.identifier.name = name;
    return node;
}

AstNode *ast_literal_int(int value, int line, int column) {
    AstNode *node = ast_node_new(AST_LITERAL, line, column);
    if (node == NULL) {
        return NULL;
    }
    node->u.literal.lit_kind = AST_LIT_INT;
    node->u.literal.as.ival = value;
    return node;
}

AstNode *ast_literal_float(double value, int line, int column) {
    AstNode *node = ast_node_new(AST_LITERAL, line, column);
    if (node == NULL) {
        return NULL;
    }
    node->u.literal.lit_kind = AST_LIT_FLOAT;
    node->u.literal.as.fval = value;
    return node;
}

AstNode *ast_literal_bool(int value, int line, int column) {
    AstNode *node = ast_node_new(AST_LITERAL, line, column);
    if (node == NULL) {
        return NULL;
    }
    node->u.literal.lit_kind = AST_LIT_BOOL;
    node->u.literal.as.bval = value ? 1 : 0;
    return node;
}

/* -------------------------------------------------------------------------- */
/* Memory cleanup                                                             */
/* -------------------------------------------------------------------------- */

void ast_free(AstNode *node) {
    while (node != NULL) {
        AstNode *next = node->next;

        switch (node->kind) {
            case AST_PROGRAM:
                ast_free(node->u.program.stmts);
                break;
            case AST_BLOCK:
                ast_free(node->u.block.stmts);
                break;
            case AST_VAR_DECL:
                ast_free(node->u.var_decl.name);
                ast_free(node->u.var_decl.init);
                break;
            case AST_ASSIGN:
                ast_free(node->u.assign.target);
                ast_free(node->u.assign.value);
                break;
            case AST_EXPR_STMT:
                ast_free(node->u.expr_stmt.expr);
                break;
            case AST_EMPTY_STMT:
                break;
            case AST_IF:
                ast_free(node->u.if_stmt.cond);
                ast_free(node->u.if_stmt.then_branch);
                ast_free(node->u.if_stmt.else_branch);
                break;
            case AST_WHILE:
                ast_free(node->u.while_stmt.cond);
                ast_free(node->u.while_stmt.body);
                break;
            case AST_PRINT:
                ast_free(node->u.print_stmt.expr);
                break;
            case AST_BINARY_OP:
                ast_free(node->u.binary.left);
                ast_free(node->u.binary.right);
                break;
            case AST_UNARY_OP:
                ast_free(node->u.unary.operand);
                break;
            case AST_IDENTIFIER:
                free(node->u.identifier.name);
                node->u.identifier.name = NULL;
                break;
            case AST_LITERAL:
                break;
            default:
                break;
        }

        free(node);
        node = next;
    }
}

/* -------------------------------------------------------------------------- */
/* Pretty printer                                                             */
/* -------------------------------------------------------------------------- */

void ast_print(const AstNode *node, FILE *out) {
    if (out == NULL) {
        return;
    }
    ast_print_indent(node, out, 0);
}

void ast_print_indent(const AstNode *node, FILE *out, int depth) {
    const AstNode *stmt;

    if (out == NULL || node == NULL) {
        return;
    }

    switch (node->kind) {
        case AST_PROGRAM:
            ast_print_spaces(out, depth);
            fputs("Program\n", out);
            for (stmt = node->u.program.stmts; stmt != NULL; stmt = stmt->next) {
                ast_print_indent(stmt, out, depth + 1);
            }
            break;

        case AST_BLOCK:
            ast_print_spaces(out, depth);
            fputs("Block\n", out);
            for (stmt = node->u.block.stmts; stmt != NULL; stmt = stmt->next) {
                ast_print_indent(stmt, out, depth + 1);
            }
            break;

        case AST_VAR_DECL:
            ast_print_spaces(out, depth);
            fprintf(out, "VarDecl %s\n", ast_type_tag_name(node->u.var_decl.type_tag));
            ast_print_indent(node->u.var_decl.name, out, depth + 1);
            if (node->u.var_decl.init != NULL) {
                ast_print_indent(node->u.var_decl.init, out, depth + 1);
            }
            break;

        case AST_ASSIGN:
            ast_print_spaces(out, depth);
            fputs("Assign\n", out);
            ast_print_indent(node->u.assign.target, out, depth + 1);
            ast_print_indent(node->u.assign.value, out, depth + 1);
            break;

        case AST_EXPR_STMT:
            ast_print_spaces(out, depth);
            fputs("ExprStmt\n", out);
            ast_print_indent(node->u.expr_stmt.expr, out, depth + 1);
            break;

        case AST_EMPTY_STMT:
            ast_print_spaces(out, depth);
            fputs("EmptyStmt\n", out);
            break;

        case AST_IF:
            ast_print_spaces(out, depth);
            fputs("If\n", out);
            ast_print_indent(node->u.if_stmt.cond, out, depth + 1);
            ast_print_indent(node->u.if_stmt.then_branch, out, depth + 1);
            if (node->u.if_stmt.else_branch != NULL) {
                ast_print_indent(node->u.if_stmt.else_branch, out, depth + 1);
            }
            break;

        case AST_WHILE:
            ast_print_spaces(out, depth);
            fputs("While\n", out);
            ast_print_indent(node->u.while_stmt.cond, out, depth + 1);
            ast_print_indent(node->u.while_stmt.body, out, depth + 1);
            break;

        case AST_PRINT:
            ast_print_spaces(out, depth);
            fputs("Print\n", out);
            ast_print_indent(node->u.print_stmt.expr, out, depth + 1);
            break;

        case AST_BINARY_OP:
            ast_print_spaces(out, depth);
            fprintf(out, "Binary %s\n", ast_binop_name(node->u.binary.op));
            ast_print_indent(node->u.binary.left, out, depth + 1);
            ast_print_indent(node->u.binary.right, out, depth + 1);
            break;

        case AST_UNARY_OP:
            ast_print_spaces(out, depth);
            fprintf(out, "Unary %s\n", ast_unop_name(node->u.unary.op));
            ast_print_indent(node->u.unary.operand, out, depth + 1);
            break;

        case AST_IDENTIFIER:
            ast_print_spaces(out, depth);
            fprintf(out, "Identifier %s\n",
                    node->u.identifier.name != NULL ? node->u.identifier.name : "");
            break;

        case AST_LITERAL:
            ast_print_spaces(out, depth);
            switch (node->u.literal.lit_kind) {
                case AST_LIT_INT:
                    fprintf(out, "Literal int %d\n", node->u.literal.as.ival);
                    break;
                case AST_LIT_FLOAT:
                    fprintf(out, "Literal float %.6g\n", node->u.literal.as.fval);
                    break;
                case AST_LIT_BOOL:
                    fprintf(out, "Literal bool %s\n",
                            node->u.literal.as.bval ? "true" : "false");
                    break;
                default:
                    fputs("Literal ?\n", out);
                    break;
            }
            break;

        default:
            ast_print_spaces(out, depth);
            fputs("Unknown\n", out);
            break;
    }
}
