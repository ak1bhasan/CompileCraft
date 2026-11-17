%{
/* ==============================================================================
 * CompileCraft - LALR(1) Syntax Analyzer Grammar (GNU Bison)
 * Conforms to Section 4.2 and Section 5 of the Language Specification
 * Milestone 3.2: Baseline Mini-Language Parser
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "parser.tab.h"
#include "tokens.h"

extern int yylex(void);
extern int yylineno;
extern int lexical_error_count;
extern FILE *yyin;
extern int syntax_error_count;

void yyerror(const char *msg);
%}

/* Semantic Value Types */
%union {
    int ival;
    double fval;
    int bval;
    char *sval;
}

/* ==============================================================================
 * Explicit Token Declarations
 * Mapped to authoritative values from src/lexer/tokens.def (258 - 289)
 * ============================================================================== */

/* Keywords (258 - 266) */
%token KW_INT          258
%token KW_FLOAT        259
%token KW_BOOL         260
%token KW_IF           261
%token KW_ELSE         262
%token KW_WHILE        263
%token KW_PRINT        264
%token <bval> KW_TRUE  265
%token <bval> KW_FALSE 266

/* Identifiers & Constants (267 - 269) */
%token <sval> IDENTIFIER    267
%token <ival> INT_LITERAL   268
%token <fval> FLOAT_LITERAL 269

/* Arithmetic Operators (270 - 274) */
%token PLUS            270
%token MINUS           271
%token STAR            272
%token SLASH           273
%token MOD             274

/* Relational Operators (275 - 280) */
%token LT              275
%token GT              276
%token LE              277
%token GE              278
%token EQ              279
%token NE              280

/* Logical Operators (281 - 283) */
%token AND             281
%token OR              282
%token NOT             283

/* Assignment Operator (284) */
%token ASSIGN          284

/* Delimiters & Punctuation (285 - 289) */
%token LBRACE          285
%token RBRACE          286
%token LPAREN          287
%token RPAREN          288
%token SEMICOLON       289

/* ==============================================================================
 * Operator Precedence and Associativity
 * Resolves ambiguities deterministically: 0 shift/reduce, 0 reduce/reduce
 * ============================================================================== */

/* Dangling-else resolution: bind else to innermost if */
%nonassoc LOWER_THAN_ELSE 300
%nonassoc KW_ELSE

/* Expression operator precedence (lowest to highest) */
%right    ASSIGN
%left     OR
%left     AND
%left     EQ NE
%left     LT GT LE GE
%left     PLUS MINUS
%left     STAR SLASH MOD
%right    NOT
%right    UMINUS 301

/* Reclaim memory for discarded tokens during error recovery */
%destructor { free($$); } <sval>

%start program

%%

/* ==============================================================================
 * Grammar Rules
 * ============================================================================== */

/* 1. Program & Statements */
program:
    statement_list
    ;

statement_list:
    statement_list statement
  | /* empty */
  ;

statement:
    var_decl_stmt
  | assign_stmt
  | if_stmt
  | while_stmt
  | print_stmt
  | block_stmt
  | expr_stmt
  | SEMICOLON
  | error_stmt
  ;

/* 2. Variable Declarations (Section 5.1, 5.2, DEC-01) */
var_decl_stmt:
    type_spec IDENTIFIER SEMICOLON
    {
        free($2);
    }
  | type_spec IDENTIFIER ASSIGN expression SEMICOLON
    {
        free($2);
    }
  ;

type_spec:
    KW_INT
  | KW_FLOAT
  | KW_BOOL
  ;

/* 3. Assignment Statements (Section 5.2) */
assign_stmt:
    IDENTIFIER ASSIGN expression SEMICOLON
    {
        free($1);
    }
  ;

/* 4. Expression Statements */
expr_stmt:
    expression SEMICOLON
    ;

/* 5. Compound Block Statements (Section 5.2, DEC-05) */
block_stmt:
    LBRACE statement_list RBRACE
    ;

/* 6. Control Flow Statements (Section 5.2) */
if_stmt:
    KW_IF LPAREN expression RPAREN statement %prec LOWER_THAN_ELSE
  | KW_IF LPAREN expression RPAREN statement KW_ELSE statement
  ;

while_stmt:
    KW_WHILE LPAREN expression RPAREN statement
  ;

/* 7. Output Statements (Section 5.2, DEC-06) */
print_stmt:
    KW_PRINT expression SEMICOLON
  ;

/* 8. Error Recovery Statement (Section 4.2, DEC-10) */
error_stmt:
    error SEMICOLON
    {
        yyerrok;
    }
  ;

/* 9. Expressions (Section 5.3, DEC-12) */
expression:
    expression PLUS expression
  | expression MINUS expression
  | expression STAR expression
  | expression SLASH expression
  | expression MOD expression
  | expression EQ expression
  | expression NE expression
  | expression LT expression
  | expression GT expression
  | expression LE expression
  | expression GE expression
  | expression AND expression
  | expression OR expression
  | NOT expression
  | MINUS expression %prec UMINUS
  | LPAREN expression RPAREN
  | IDENTIFIER
    {
        free($1);
    }
  | INT_LITERAL
  | FLOAT_LITERAL
  | KW_TRUE
  | KW_FALSE
  ;

%%

/* ==============================================================================
 * Diagnostic Error Reporter
 * ============================================================================== */

void yyerror(const char *msg) {
    syntax_error_count++;
    fprintf(stderr, "Syntax Error at line %d: %s\n", yylineno, msg);
}
