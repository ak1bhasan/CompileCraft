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
    TAC_OP_AND,         /* dest = src1 && src2 */
    TAC_OP_OR,          /* dest = src1 || src2 */
    TAC_OP_NOT,         /* dest = !src1 */
    TAC_OP_NEG,         /* dest = -src1 */
    TAC_OP_GOTO,        /* goto label */
    TAC_OP_IF_GOTO,     /* if cond goto label */
    TAC_OP_LABEL,       /* label: */
    TAC_OP_PRINT        /* print src1 */
} TacOpcode;

typedef struct TacInstr {
    TacOpcode opcode;
    char *dest;
    char *src1;
    char *src2;
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
} TacGenerator;

/* Lifecycle Operations */
TacGenerator *tac_generator_create(void);
void tac_generator_destroy(TacGenerator *gen);

/* Generation from AST */
TacList *tac_generate_program(const AstNode *root);

/* Printing and Memory Management */
void tac_print(const TacList *list, FILE *out);
void tac_list_free(TacList *list);

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_TAC_H */
