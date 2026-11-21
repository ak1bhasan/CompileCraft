%{
/* ==============================================================================
 * CompileCraft - LALR(1) Syntax Analyzer Grammar (GNU Bison)
 * Conforms to Section 4.2 and Section 5 of the Language Specification
 * Milestone 3.3: Parser Hardening (diagnostics + recovery)
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

/* Deduplicate consecutive identical diagnostics at the same line. */
static int last_syntax_error_line = -1;
static char last_syntax_error_msg[256];
%}

/* Semantic Value Types */
%union {
    int ival;
    double fval;
    int bval;
    char *sval;
}

/* Token / nonterminal source spans (YYLTYPE); filled by the parser-linked lexer */
%locations

/* Detailed diagnostics with LAC for accurate expected-token sets (Bison 3.6+) */
%define parse.error detailed
%define parse.lac full

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

/* 1. Program & Statements
 * Top-level error production recovers at EOF after an incomplete construct
 * (e.g. missing closing brace) without inventing phantom statements.
 */
program:
    statement_list
  | statement_list error
    {
        yyerrok;
    }
  ;

statement_list:
    statement_list statement
  | %empty
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

/* 5. Compound Block Statements (Section 5.2, DEC-05)
 * Brace synchronization: recover malformed content inside a block at '}'.
 */
block_stmt:
    LBRACE statement_list RBRACE
  | LBRACE statement_list error RBRACE
    {
        yyerrok;
    }
  ;

/* 6. Control Flow Statements (Section 5.2)
 * Condition recovery: sync at ')' so an empty/malformed condition does not
 * cascade into a spurious brace diagnostic for the following statement body.
 */
if_stmt:
    KW_IF LPAREN expression RPAREN statement %prec LOWER_THAN_ELSE
  | KW_IF LPAREN expression RPAREN statement KW_ELSE statement
  | KW_IF LPAREN error RPAREN statement %prec LOWER_THAN_ELSE
    {
        yyerrok;
    }
  | KW_IF LPAREN error RPAREN statement KW_ELSE statement
    {
        yyerrok;
    }
  ;

while_stmt:
    KW_WHILE LPAREN expression RPAREN statement
  | KW_WHILE LPAREN error RPAREN statement
    {
        yyerrok;
    }
  ;

/* 7. Output Statements (Section 5.2, DEC-06) */
print_stmt:
    KW_PRINT expression SEMICOLON
  ;

/* 8. Error Recovery Statement (Section 4.2, DEC-10)
 * Semicolon synchronization: discard tokens until ';' then resume.
 */
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
 * Bison (parse.error detailed + LAC) supplies unexpected/expected token text.
 * Lexical errors are reported separately by the Flex scanner.
 * ============================================================================== */

void yyerror(const char *msg) {
    /* Suppress only exact duplicate consecutive reports (same line + same text). */
    if (yylineno == last_syntax_error_line &&
        last_syntax_error_msg[0] != '\0' &&
        strcmp(last_syntax_error_msg, msg) == 0) {
        return;
    }
    last_syntax_error_line = yylineno;
    strncpy(last_syntax_error_msg, msg, sizeof(last_syntax_error_msg) - 1);
    last_syntax_error_msg[sizeof(last_syntax_error_msg) - 1] = '\0';
    syntax_error_count++;
    fprintf(stderr, "Syntax Error at line %d: %s\n", yylineno, msg);
}
