/* ==============================================================================
 * CompileCraft - Program AST structural-test harness (M4.2.6 / M4.3.1)
 *
 * Parses a source file, takes the AST_PROGRAM root from compilecraft_ast_root
 * (production ownership handoff), and prints it with ast_print.
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "parser.tab.h"
#include "tokens.h"
#include "parser.h"
#include "ast.h"

extern FILE *yyin;
extern int yylineno;
int yylex_destroy(void);

int syntax_error_count = 0;

int main(int argc, char **argv) {
    const char *source_path = NULL;
    FILE *file;
    int parse_status;
    int ok;

    for (int i = 1; i < argc; i++) {
        if (argv[i][0] != '-') {
            source_path = argv[i];
        } else {
            fprintf(stderr, "Usage: %s <source-file>\n", argv[0]);
            return 1;
        }
    }

    if (source_path == NULL) {
        fprintf(stderr, "Usage: %s <source-file>\n", argv[0]);
        return 1;
    }

    file = fopen(source_path, "r");
    if (!file) {
        fprintf(stderr, "Error: Cannot open source file '%s'\n", source_path);
        return 1;
    }

    yyin = file;
    yylineno = 1;
    compilecraft_loc_reset();
    lexical_error_count = 0;
    syntax_error_count = 0;
    compilecraft_expr_capture = NULL;
    compilecraft_capture_expr_enable = 0;
    compilecraft_ast_root = NULL;

    parse_status = yyparse();

    fclose(file);
    yylex_destroy();

    ok = (parse_status == 0 && syntax_error_count == 0 &&
          lexical_error_count == 0 && compilecraft_ast_root != NULL);

    if (ok) {
        ast_print(compilecraft_ast_root, stdout);
        ast_free(compilecraft_ast_root);
        compilecraft_ast_root = NULL;
        return 0;
    }

    ast_free(compilecraft_ast_root);
    compilecraft_ast_root = NULL;
    return 1;
}
