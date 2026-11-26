#include "tokens.h"

/* In parser builds, Bison's parser.tab.c defines yylval. */
#ifndef BISON_OWNS_YYLVAL
YYSTYPE yylval;
#endif

const char *cpp_token_name(int token) {
    switch (token) {
#define TOKEN_DEF(id, val, name) case id: return name;
#include "tokens.def"
#undef TOKEN_DEF
        case YYEOF: return "EOF";
        default: return "UNKNOWN_TOKEN";
    }
}

