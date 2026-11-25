/* ==============================================================================
 * CompileCraft - Semantic Analyzer Standalone Driver
 * Milestone 6: Program Analysis and Type Checking Driver
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "parser.tab.h"
#include "tokens.h"
#include "parser.h"
#include "ast.h"
#include "semantic.h"

/* Compile-time token verification */
#define TOKEN_DEF(id, val, name) \
    _Static_assert((int)(id) == (val), \
        "Token ID mismatch between parser.tab.h and tokens.def for " name);
#include "tokens.def"
#undef TOKEN_DEF

extern FILE *yyin;
extern int yylineno;
int yylex_destroy(void);

int syntax_error_count = 0;

static void usage(const char *argv0) {
    fprintf(stderr, "Usage: %s <source-file>\n", argv0);
}

int main(int argc, char **argv) {
    const char *source_path = NULL;

    for (int i = 1; i < argc; i++) {
        if (argv[i][0] != '-') {
            if (source_path != NULL) {
                usage(argv[0]);
                return 1;
            }
            source_path = argv[i];
        } else {
            usage(argv[0]);
            return 1;
        }
    }

    if (source_path == NULL) {
        usage(argv[0]);
        return 1;
    }

    FILE *file = fopen(source_path, "r");
    if (!file) {
        fprintf(stderr, "Error: Cannot open source file '%s'\n", source_path);
        return 1;
    }

    yyin = file;
    yylineno = 1;
    compilecraft_loc_reset();
    lexical_error_count = 0;
    syntax_error_count = 0;
    compilecraft_ast_root = NULL;

    int parse_status = yyparse();

    fclose(file);
    yylex_destroy();

    /* If syntax or lexical errors occurred, report failure */
    if (parse_status != 0 || syntax_error_count > 0 || lexical_error_count > 0 || !compilecraft_ast_root) {
        ast_free(compilecraft_ast_root);
        compilecraft_ast_root = NULL;
        return 1;
    }

    /* Execute semantic analysis */
    SemanticAnalyzer *sa = semantic_analyzer_create();
    if (!sa) {
        ast_free(compilecraft_ast_root);
        compilecraft_ast_root = NULL;
        return 1;
    }

    int sem_errors = semantic_analyze(sa, compilecraft_ast_root);
    semantic_analyzer_destroy(sa);

    ast_free(compilecraft_ast_root);
    compilecraft_ast_root = NULL;

    if (sem_errors == 0) {
        printf("Semantic analysis successful.\n");
        return 0;
    }

    return 1;
}
