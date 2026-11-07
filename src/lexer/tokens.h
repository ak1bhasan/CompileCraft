#ifndef COMPILECRAFT_TOKENS_H
#define COMPILECRAFT_TOKENS_H

/* ==============================================================================
 * CompileCraft - Shared Token Declarations & Types
 * Conforming to Section 5 of the Compiler Construction Language Specification
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
#define KW_BOOL         KW_BOOL
#define KW_IF           KW_IF
#define KW_ELSE         KW_ELSE
#define KW_WHILE        KW_WHILE
#define KW_PRINT        KW_PRINT
#define KW_TRUE         KW_TRUE
#define KW_FALSE        KW_FALSE
#define IDENTIFIER      IDENTIFIER
#define INT_LITERAL     INT_LITERAL
#define FLOAT_LITERAL   FLOAT_LITERAL
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
#define LBRACE          LBRACE
#define RBRACE          RBRACE
#define LPAREN          LPAREN
#define RPAREN          RPAREN
#define SEMICOLON       SEMICOLON

/* Semantic Value Union for Standalone Lexer Mode */
#ifndef YYSTYPE_DEFINED
#define YYSTYPE_DEFINED
typedef union YYSTYPE {
    int ival;
    double fval;
    int bval;
    char *sval;
} YYSTYPE;
#endif

extern YYSTYPE yylval;
extern int lexical_error_count;

/* Returns a human-readable name for any valid token ID */
const char *token_name(int token);

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_TOKENS_H */
