#include "tokens.h"

YYSTYPE yylval;

const char *token_name(int token) {
    switch (token) {
#define TOKEN_DEF(id, val, name) case id: return name;
#include "tokens.def"
#undef TOKEN_DEF
        case YYEOF: return "EOF";
        default: return "UNKNOWN_TOKEN";
    }
}
