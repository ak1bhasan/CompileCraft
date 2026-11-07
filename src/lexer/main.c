/* ==============================================================================
 * CompileCraft - Standalone Lexical Analyzer Driver
 * Reads a source program and prints deterministic token stream information
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include "tokens.h"

extern FILE *yyin;
extern int yylineno;
extern int yylex(void);
extern char *yytext;
extern int lexical_error_count;
int yylex_destroy(void);

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <source-file>\n", argv[0]);
        return 1;
    }

    FILE *file = fopen(argv[1], "r");
    if (!file) {
        fprintf(stderr, "Error: Cannot open source file '%s'\n", argv[1]);
        return 1;
    }

    yyin = file;
    yylineno = 1;
    lexical_error_count = 0;

    int token;
    while ((token = yylex()) != 0) {
        printf("Line %d: %s '%s'\n", yylineno, token_name(token), yytext);
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
