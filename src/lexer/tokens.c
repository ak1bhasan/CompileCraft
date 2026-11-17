#include "tokens.h"

/* In parser builds, Bison's parser.tab.c defines yylval.
 * In standalone lexer builds, tokens.c provides the definition. */
#ifndef BISON_OWNS_YYLVAL
YYSTYPE yylval;
#endif

const char *token_name(int token) {
    switch (token) {
#define TOKEN_DEF(id, val, name) case id: return name;
#include "tokens.def"
#undef TOKEN_DEF
        case YYEOF: return "EOF";
        default: return "UNKNOWN_TOKEN";
    }
}
