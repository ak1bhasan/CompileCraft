#ifndef COMPILECRAFT_SEMANTIC_H
#define COMPILECRAFT_SEMANTIC_H

/* ==============================================================================
 * CompileCraft - Semantic Analyzer (Milestone 6)
 * Validates AST semantics against Section 4.5 and Section 5 of specification.
 * ============================================================================== */

#include "../ast/ast.h"
#include "../symbol_table/symbol_table.h"
#include <stdio.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SemanticAnalyzer {
    SymbolTable *symtab;
    int error_count;
    FILE *out; /* Diagnostic output stream (default: stderr) */
} SemanticAnalyzer;

/* Lifecycle Operations */
SemanticAnalyzer *semantic_analyzer_create(void);
void semantic_analyzer_destroy(SemanticAnalyzer *sa);

/* Runs semantic analysis over an AST program root. Returns error count (0 on clean success). */
int semantic_analyze(SemanticAnalyzer *sa, const AstNode *root);

/* Convenience one-shot analysis printing diagnostics to stderr */
int semantic_check_ast(const AstNode *root);

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_SEMANTIC_H */
