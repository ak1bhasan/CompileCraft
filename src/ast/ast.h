#ifndef COMPILECRAFT_AST_H
#define COMPILECRAFT_AST_H

/* ==============================================================================
 * CompileCraft - Abstract Syntax Tree (Milestone 4.1)
 * Design authority: docs/ast.md
 * ============================================================================== */

#include <stdio.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum AstKind {
    AST_PROGRAM,
    AST_BLOCK,
    AST_SEQ,
    AST_VAR_DECL,
    AST_ASSIGN,
    AST_EXPR_STMT,
    AST_EMPTY_STMT,
    AST_IF,
    AST_WHILE,
    AST_PRINT,
    AST_OUTPUT,
    AST_INPUT,
    AST_BINARY_OP,
    AST_UNARY_OP,
    AST_ADDR_OF,
    AST_SCANNER_NEW,
    AST_INPUT_CALL,
    AST_IDENTIFIER,
    AST_LITERAL
} AstKind;

typedef enum AstOutputMode {
    AST_OUTPUT_RAW = 0,     /* Stream / raw output items (e.g. C++ std::cout) */
    AST_OUTPUT_PRINTF,      /* C printf(format_literal, args...) */
    AST_OUTPUT_CONCAT       /* Java System.out.print/println with '+' concat */
} AstOutputMode;

typedef enum AstInputMode {
    AST_INPUT_SCANF = 0,    /* C scanf(format_literal, targets...) */
    AST_INPUT_CIN           /* C++ cin / std::cin extraction chain */
} AstInputMode;

typedef enum AstTypeTag {
    AST_TYPE_INT,
    AST_TYPE_FLOAT,
    AST_TYPE_BOOL,
    AST_TYPE_STRING,
    AST_TYPE_SCANNER
} AstTypeTag;

typedef enum AstBinOp {
    AST_OP_ADD,
    AST_OP_SUB,
    AST_OP_MUL,
    AST_OP_DIV,
    AST_OP_MOD,
    AST_OP_EQ,
    AST_OP_NE,
    AST_OP_LT,
    AST_OP_GT,
    AST_OP_LE,
    AST_OP_GE,
    AST_OP_AND,
    AST_OP_OR
} AstBinOp;

typedef enum AstUnOp {
    AST_OP_NOT,
    AST_OP_NEG
} AstUnOp;

typedef enum AstLitKind {
    AST_LIT_INT,
    AST_LIT_FLOAT,
    AST_LIT_BOOL,
    AST_LIT_STRING
} AstLitKind;

typedef struct AstNode AstNode;

struct AstNode {
    AstKind kind;
    int line;
    int column;
    AstNode *next; /* sibling in a statement list; otherwise NULL */
    /* Internal: set when this node is owned by any AstList / stmt chain.
     * Prevents cross-list append of a tail/sole member (where next == NULL).
     * Not part of the public mutation API; callers must not clear it. */
    unsigned char in_stmt_list;

    union {
        struct {
            AstNode *stmts;
            AstNode *stmts_tail;
        } program;

        struct {
            AstNode *stmts;
            AstNode *stmts_tail;
        } block;

        struct {
            AstNode *stmts;
            AstNode *stmts_tail;
        } seq;

        struct {
            AstTypeTag type_tag;
            int array_size; /* > 0 for bounded C char arrays (e.g. char name[64]), else 0 */
            AstNode *name; /* AST_IDENTIFIER */
            AstNode *init; /* optional expression */
        } var_decl;

        struct {
            AstNode *target; /* AST_IDENTIFIER */
            AstNode *value;
        } assign;

        struct {
            AstNode *expr;
        } expr_stmt;

        struct {
            AstNode *cond;
            AstNode *then_branch;
            AstNode *else_branch; /* optional */
        } if_stmt;

        struct {
            AstNode *cond;
            AstNode *body;
        } while_stmt;

        struct {
            AstNode *expr;
        } print_stmt;

        struct {
            AstNode *items;
            AstNode *items_tail;
            int newline; /* 1 for println / std::endl, 0 otherwise */
            AstOutputMode mode;
        } output_stmt;

        struct {
            AstNode *items;
            AstNode *items_tail;
            AstInputMode mode;
        } input_stmt;

        struct {
            AstBinOp op;
            AstNode *left;
            AstNode *right;
        } binary;

        struct {
            AstUnOp op;
            AstNode *operand;
        } unary;

        struct {
            AstNode *operand;
        } addr_of;

        struct {
            char *class_name;  /* owned heap string (e.g. "Scanner") */
            char *source_name; /* owned heap string (e.g. "System.in") */
        } scanner_new;

        struct {
            AstNode *receiver; /* AST_IDENTIFIER */
            char *method_name; /* owned heap string (e.g. "nextInt") */
        } input_call;

        struct {
            char *name; /* owned heap string */
        } identifier;

        struct {
            AstLitKind lit_kind;
            union {
                int ival;
                double fval;
                int bval;
                char *sval; /* owned heap string for AST_LIT_STRING */
            } as;
        } literal;
    } u;
};

/* Statement list with O(1) append via head/tail. */
typedef struct AstList {
    AstNode *head;
    AstNode *tail;
} AstList;

/*
 * List helpers
 * ------------
 * ast_list_empty: returns {NULL, NULL}.
 * ast_list_append:
 *   On success (returns 1 / true):
 *     - Inserts stmt at the end (O(1) via tail).
 *     - Transfers ownership of stmt to the destination list exactly once.
 *     - Sets stmt->in_stmt_list (internal membership).
 *     - Requires stmt->next == NULL and stmt not already list-owned.
 *   On failure (returns 0 / false):
 *     - Leaves *list completely unchanged (no head/tail/next writes).
 *     - Does NOT free stmt and does NOT transfer ownership to *list.
 *     - Fails if list/stmt is NULL, stmt->next != NULL, or
 *       stmt->in_stmt_list != 0 (already owned by this or another list,
 *       including tails and sole members where next is NULL).
 *     - Ownership after rejection:
 *         * If stmt->in_stmt_list != 0: the existing list remains the owner;
 *           the caller must NOT free stmt.
 *         * Otherwise the caller still owns stmt and is responsible for
 *           releasing it (or retrying with a valid list).
 *   Public list API cannot create cycles: rejected nodes are never linked.
 * ast_list_head: returns list.head (may be NULL).
 */
AstList ast_list_empty(void);
int ast_list_append(AstList *list, AstNode *stmt);
AstNode *ast_list_head(AstList list);
/* If *list holds exactly one node, detaches and returns it without mutating
 * ownership externally (leaves *list empty). Returns NULL otherwise. */
AstNode *ast_list_take_single(AstList *list);

/*
 * Constructors
 * ------------
 * On success: return a new node; take ownership of required child pointers /
 *             identifier strings passed in.
 * On failure: free any children/strings that would have been owned, return NULL.
 * Optional children (init, else_branch) may be NULL.
 * Required children must be non-NULL and of the documented kinds where noted.
 */
AstNode *ast_program(AstList stmts, int line, int column);
AstNode *ast_block(AstList stmts, int line, int column);
/* Flat non-scoping statement sequence (e.g. multi-line C++ cout chain). */
AstNode *ast_seq(AstList stmts, int line, int column);
AstNode *ast_var_decl(AstTypeTag type_tag, AstNode *name, AstNode *init,
                      int line, int column);
AstNode *ast_var_decl_array(AstTypeTag type_tag, AstNode *name, int array_size,
                            AstNode *init, int line, int column);
AstNode *ast_assign(AstNode *target, AstNode *value, int line, int column);
AstNode *ast_expr_stmt(AstNode *expr, int line, int column);
AstNode *ast_empty_stmt(int line, int column);
AstNode *ast_if(AstNode *cond, AstNode *then_branch, AstNode *else_branch,
                int line, int column);
AstNode *ast_while(AstNode *cond, AstNode *body, int line, int column);
/* Print-statement constructor (named ast_print_stmt to avoid clashing with
 * the pretty-printer ast_print). */
AstNode *ast_print_stmt(AstNode *expr, int line, int column);
/* Multi-item console output statement (takes ownership of items chain). */
AstNode *ast_output(AstList items, int newline, int line, int column);
AstNode *ast_output_with_mode(AstList items, AstOutputMode mode, int newline,
                              int line, int column);
int ast_output_append_item(AstNode *output_node, AstNode *item);
int ast_output_set_newline(AstNode *output_node, int newline);
/* Multi-item console input statement (takes ownership of items chain). */
AstNode *ast_input(AstList items, AstInputMode mode, int line, int column);
int ast_input_append_item(AstNode *input_node, AstNode *item);
AstNode *ast_binary(AstBinOp op, AstNode *left, AstNode *right,
                    int line, int column);
AstNode *ast_unary(AstUnOp op, AstNode *operand, int line, int column);
AstNode *ast_addr_of(AstNode *operand, int line, int column);
AstNode *ast_scanner_new(char *class_name, char *source_name, int line, int column);
AstNode *ast_input_call(AstNode *receiver, char *method_name, int line, int column);

/* Takes ownership of name/value. Passed pointer must be non-NULL. */
AstNode *ast_identifier(char *name, int line, int column);
AstNode *ast_literal_int(int value, int line, int column);
AstNode *ast_literal_float(double value, int line, int column);
AstNode *ast_literal_bool(int value, int line, int column);
AstNode *ast_literal_string(char *value, int line, int column);

/*
 * ast_free: recursively frees a node, its owned children/strings, and the
 *           entire next-sibling chain starting at node (list-head semantics).
 *           NULL is a no-op.
 */
void ast_free(AstNode *node);

/* Deterministic indented pretty-printer (docs/ast.md §9). */
void ast_print(const AstNode *node, FILE *out);
void ast_print_indent(const AstNode *node, FILE *out, int depth);

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_AST_H */
