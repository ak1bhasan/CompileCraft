#ifndef COMPILECRAFT_C_TOKENS_H
#define COMPILECRAFT_C_TOKENS_H

/* ==============================================================================
 * CompileCraft - Shared Token Declarations & Types for C Subset
 * Conforming to ISO C99/C11 Procedural Subset (docs/tokens_c.md)
 * Compatible with GNU Bison token generation (parser.tab.h)
 * ============================================================================== */

#ifdef __cplusplus
extern "C" {
#endif

/* Authoritative token definition compatible with GNU Bison (parser.tab.h) */
#ifndef YYTOKENTYPE
#define YYTOKENTYPE 1
#define YYTOKENTYPE_IS_DECLARED 1
enum yytokentype {
    YYEMPTY = -2,
    YYEOF = 0,
    YYerror = 256,
    YYUNDEF = 257,
#define TOKEN_DEF(id, val, name) id = val,
#include "tokens.def"
#undef TOKEN_DEF
};
typedef enum yytokentype yytoken_kind_t;
#endif

/* Token macros matching Bison's generated parser.tab.h defines */
#define KW_INT          KW_INT
#define KW_FLOAT        KW_FLOAT
#define KW_DOUBLE       KW_DOUBLE
#define KW_CHAR         KW_CHAR
#define KW_VOID         KW_VOID
#define KW_IF           KW_IF
#define KW_ELSE         KW_ELSE
#define KW_WHILE        KW_WHILE
#define KW_FOR          KW_FOR
#define KW_RETURN       KW_RETURN
#define KW_BREAK        KW_BREAK
#define KW_CONTINUE     KW_CONTINUE

#define IDENTIFIER      IDENTIFIER
#define INT_LITERAL     INT_LITERAL
#define FLOAT_LITERAL   FLOAT_LITERAL
#define CHAR_LITERAL    CHAR_LITERAL
#define STRING_LITERAL  STRING_LITERAL

#define PLUS            PLUS
#define MINUS           MINUS
#define STAR            STAR
#define SLASH           SLASH
#define MOD             MOD

#define LT              LT
#define GT              GT
#define LE              LE
#define GE              GE
#define EQ              EQ
#define NE              NE

#define AND             AND
#define OR              OR
#define NOT             NOT

#define ASSIGN          ASSIGN
#define PLUS_ASSIGN     PLUS_ASSIGN
#define MINUS_ASSIGN    MINUS_ASSIGN
#define STAR_ASSIGN     STAR_ASSIGN
#define SLASH_ASSIGN    SLASH_ASSIGN
#define MOD_ASSIGN      MOD_ASSIGN

#define INC             INC
#define DEC             DEC

#define LBRACE          LBRACE
#define RBRACE          RBRACE
#define LPAREN          LPAREN
#define RPAREN          RPAREN
#define LBRACKET        LBRACKET
#define RBRACKET        RBRACKET
#define SEMICOLON       SEMICOLON
#define COMMA           COMMA

/* Semantic Value Union for Standalone Lexer Mode */
#ifndef YYSTYPE_DEFINED
#define YYSTYPE_DEFINED
typedef union YYSTYPE {
    int ival;
    double fval;
    char cval;
    char *sval;
} YYSTYPE;
#endif

extern YYSTYPE yylval;
extern int c_lexical_error_count;

/* Returns a human-readable name for any valid token ID */
const char *c_token_name(int token);

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_C_TOKENS_H */

