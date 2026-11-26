#ifndef COMPILECRAFT_TAC_H
#define COMPILECRAFT_TAC_H

/* ==============================================================================
 * CompileCraft - Three-Address Code (TAC) Intermediate Representation (Milestone 7)
 * ============================================================================== */

#include "../ast/ast.h"
#include <stdio.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum TacOpcode {
    TAC_OP_ASSIGN,      /* dest = src1 */
    TAC_OP_ADD,         /* dest = src1 + src2 */
    TAC_OP_SUB,         /* dest = src1 - src2 */
    TAC_OP_MUL,         /* dest = src1 * src2 */
    TAC_OP_DIV,         /* dest = src1 / src2 */
    TAC_OP_MOD,         /* dest = src1 % src2 */
    TAC_OP_EQ,          /* dest = src1 == src2 */
    TAC_OP_NE,          /* dest = src1 != src2 */
    TAC_OP_LT,          /* dest = src1 < src2 */
    TAC_OP_GT,          /* dest = src1 > src2 */
    TAC_OP_LE,          /* dest = src1 <= src2 */
    TAC_OP_GE,          /* dest = src1 >= src2 */
    TAC_OP_AND,         /* dest = src1 && src2 (eager; see DEC-07) */
    TAC_OP_OR,          /* dest = src1 || src2 (eager; see DEC-07) */
    TAC_OP_NOT,         /* dest = !src1 */
    TAC_OP_NEG,         /* dest = -src1 */
    TAC_OP_GOTO,        /* goto label */
    TAC_OP_IF_GOTO,     /* if cond goto label */
    TAC_OP_LABEL,       /* label: */
    TAC_OP_PRINT,       /* print src1 */
    TAC_OP_PRINTLN,     /* println [src1] */
    TAC_OP_ARG,         /* arg src1 */
    TAC_OP_PRINTF,      /* printf fmt (src1) */
    TAC_OP_ITOF,        /* dest = (float)src1 */
    TAC_OP_UNINIT,      /* mark dest uninitialized for block/loop slot reset */
    TAC_OP_READ_INT,    /* dest = read_int <mode: "prefix"|"token"> */
    TAC_OP_READ_FLOAT,  /* dest = read_float <mode: "prefix"|"token"> */
    TAC_OP_READ_BOOL,   /* dest = read_bool <mode: "cpp"|"java"> */
    TAC_OP_READ_STR,    /* dest = read_str [cap] */
    TAC_OP_READ_LINE,   /* dest = read_line */
    TAC_OP_SCAN_WS,     /* scan_ws (consume 0+ whitespace chars) */
    TAC_OP_SCAN_LIT     /* scan_lit <quoted_literal> */
} TacOpcode;

typedef struct TacScope TacScope;

typedef struct TacInstr {
    TacOpcode opcode;
    char *dest;
    char *src1;
    char *src2;
    int line;
    struct TacInstr *next;
} TacInstr;

typedef struct TacList {
    TacInstr *head;
    TacInstr *tail;
    int count;
} TacList;

typedef struct TacGenerator {
    TacList instructions;
    int next_temp_id;
    int next_label_id;
    int next_var_id;
    int current_line;
    int block_depth;
    TacScope *scope;
    char **seen_names;
    size_t seen_count;
    size_t seen_capacity;
    int failed; /* non-zero if generation cannot produce a complete stream */
} TacGenerator;

/* Lifecycle Operations */
TacGenerator *tac_generator_create(void);
void tac_generator_destroy(TacGenerator *gen);

/*
 * Generate TAC for a program AST.
 * Returns a newly allocated TacList on success (caller owns via tac_list_free).
 * Returns NULL on failure (invalid root, OOM, or incomplete emission).
 * Never returns a partial instruction list as success.
 */
TacList *tac_generate_program(const AstNode *root);

/* Printing and Memory Management */
void tac_print(const TacList *list, FILE *out);
void tac_list_free(TacList *list);

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_TAC_H */
