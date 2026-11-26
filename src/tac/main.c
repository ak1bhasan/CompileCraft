/* ==============================================================================
 * CompileCraft - Semantic-to-TAC Integration Driver (Milestone 7)
 *
 * Pipeline: parse → semantic analyze → TAC generate → print TAC
 * Not the M8 unified CLI. Emits TAC only after a clean semantic pass.
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "parser.tab.h"
#include "tokens.h"
#include "parser.h"
#include "ast.h"
#include "semantic.h"
#include "tac.h"

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

    if (parse_status != 0 || syntax_error_count > 0 || lexical_error_count > 0 ||
        !compilecraft_ast_root) {
        ast_free(compilecraft_ast_root);
        compilecraft_ast_root = NULL;
        return 1;
    }

    SemanticAnalyzer *sa = semantic_analyzer_create();
    if (!sa) {
        ast_free(compilecraft_ast_root);
        compilecraft_ast_root = NULL;
        return 1;
    }

    int sem_errors = semantic_analyze(sa, compilecraft_ast_root);
    semantic_analyzer_destroy(sa);

    if (sem_errors != 0) {
        ast_free(compilecraft_ast_root);
        compilecraft_ast_root = NULL;
        return 1;
    }

    TacList *tac = tac_generate_program(compilecraft_ast_root);
    ast_free(compilecraft_ast_root);
    compilecraft_ast_root = NULL;

    if (!tac) {
        fprintf(stderr, "Error: TAC generation failed.\n");
        return 1;
    }

    tac_print(tac, stdout);
    tac_list_free(tac);
    return 0;
}
