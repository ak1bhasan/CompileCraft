/* ==============================================================================
 * CompileCraft - Standalone Lexical Analyzer Driver
 * Reads a source program and prints deterministic token stream information
 * Optional --semantic flag appends YYSTYPE payloads without changing default output
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "tokens.h"

extern FILE *yyin;
extern int yylineno;
extern int yylex(void);
extern char *yytext;
extern int lexical_error_count;
int yylex_destroy(void);

static void print_semantic_payload(int token) {
    switch (token) {
        case INT_LITERAL:
            printf(" ival=%d", yylval.ival);
            break;
        case FLOAT_LITERAL:
            printf(" fval=%.6f", yylval.fval);
            break;
        case KW_TRUE:
        case KW_FALSE:
            printf(" bval=%d", yylval.bval);
            break;
        case IDENTIFIER:
            if (yylval.sval != NULL) {
                printf(" sval=%s", yylval.sval);
            }
            break;
        default:
            break;
    }
}

int main(int argc, char **argv) {
    int dump_semantic = 0;
    const char *source_path = NULL;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--semantic") == 0) {
            dump_semantic = 1;
        } else if (argv[i][0] != '-') {
            source_path = argv[i];
        } else {
            fprintf(stderr, "Usage: %s [--semantic] <source-file>\n", argv[0]);
            return 1;
        }
    }

    if (source_path == NULL) {
        fprintf(stderr, "Usage: %s [--semantic] <source-file>\n", argv[0]);
        return 1;
    }

    FILE *file = fopen(source_path, "r");
    if (!file) {
        fprintf(stderr, "Error: Cannot open source file '%s'\n", source_path);
        return 1;
    }

    yyin = file;
    yylineno = 1;
    lexical_error_count = 0;

    int token;
    while ((token = yylex()) != 0) {
        printf("Line %d: %s '%s'", yylineno, token_name(token), yytext);
        if (dump_semantic) {
            print_semantic_payload(token);
        }
        printf("\n");
        fflush(stdout);

        /* Clean up heap-allocated token strings */
        if (token == IDENTIFIER && yylval.sval != NULL) {
            free(yylval.sval);
            yylval.sval = NULL;
        }
    }

    fclose(file);
    yylex_destroy();

    if (lexical_error_count > 0) {
        return 1;
    }

    return 0;
}
