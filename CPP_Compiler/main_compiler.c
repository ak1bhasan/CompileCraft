/* ==============================================================================
 * CompileCraft - C++ Front-End Driver (Milestone 10)
 *
 * Pipeline: C++ Flex → C++ Bison → shared AST → semantic → TAC
 * Usage: bin/compilecraft-cpp.exe <source.cpp>
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cpp_parser.tab.h"
#include "tokens.h"
#include "parser.h"
#include "ast.h"
#include "semantic.h"
#include "tac.h"

#define TOKEN_DEF(id, val, name) \
    _Static_assert((int)(id) == (val), \
        "Token ID mismatch between cpp_parser.tab.h and tokens.def for " name);
#include "tokens.def"
#undef TOKEN_DEF

extern FILE *yyin;
extern int yylineno;
int yylex_destroy(void);

int syntax_error_count = 0;

static void usage(const char *argv0) {
    fprintf(stderr, "Usage: %s [--ast | --symtab] <source-file.cpp>\n", argv0);
}

int main(int argc, char **argv) {
    const char *source_path = NULL;
    int print_ast = 0;
    int print_symtab = 0;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--ast") == 0) {
            print_ast = 1;
        } else if (strcmp(argv[i], "--symtab") == 0) {
            print_symtab = 1;
        } else if (argv[i][0] != '-') {
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

    if (source_path == NULL || (print_ast && print_symtab)) {
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
    compilecraft_cpp_loc_reset();
    cpp_lexical_error_count = 0;
    syntax_error_count = 0;
    compilecraft_cpp_ast_root = NULL;

    int parse_status = yyparse();

    fclose(file);
    yylex_destroy();

    if (parse_status != 0 || syntax_error_count > 0 || cpp_lexical_error_count > 0 ||
        !compilecraft_cpp_ast_root) {
        ast_free(compilecraft_cpp_ast_root);
        compilecraft_cpp_ast_root = NULL;
        return 1;
    }

    if (print_ast) {
        ast_print(compilecraft_cpp_ast_root, stdout);
        ast_free(compilecraft_cpp_ast_root);
        compilecraft_cpp_ast_root = NULL;
        return 0;
    }

    SemanticAnalyzer *sa = semantic_analyzer_create();
    if (!sa) {
        ast_free(compilecraft_cpp_ast_root);
        compilecraft_cpp_ast_root = NULL;
        return 1;
    }

    int sem_errors = semantic_analyze(sa, compilecraft_cpp_ast_root);

    if (sem_errors != 0) {
        semantic_analyzer_destroy(sa);
        ast_free(compilecraft_cpp_ast_root);
        compilecraft_cpp_ast_root = NULL;
        return 1;
    }

    if (print_symtab) {
        symbol_table_print(sa->symtab, stdout);
        semantic_analyzer_destroy(sa);
        ast_free(compilecraft_cpp_ast_root);
        compilecraft_cpp_ast_root = NULL;
        return 0;
    }

    semantic_analyzer_destroy(sa);

    TacList *tac = tac_generate_program(compilecraft_cpp_ast_root);
    ast_free(compilecraft_cpp_ast_root);
    compilecraft_cpp_ast_root = NULL;

    if (!tac) {
        fprintf(stderr, "Error: TAC generation failed.\n");
        return 1;
    }

    tac_print(tac, stdout);
    tac_list_free(tac);
    return 0;
}
