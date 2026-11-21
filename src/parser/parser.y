%{
/* ==============================================================================
 * CompileCraft - LALR(1) Syntax Analyzer Grammar (GNU Bison)
 * Conforms to Section 4.2 and Section 5 of the Language Specification
 * Milestone 3.3: Parser Hardening (diagnostics + recovery)
 * Milestone 4.2.3: %locations
 * Milestone 4.2.4: AST semantic-value types + destructors
 * Milestone 4.2.5: Expression AST construction
 * Milestone 4.2.6: Statement and program AST construction
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "parser.tab.h"
#include "tokens.h"
#include "ast.h"

extern int yylex(void);
extern int yylineno;
extern int lexical_error_count;
extern FILE *yyin;
extern int syntax_error_count;

void yyerror(const char *msg);

/* Deduplicate consecutive identical diagnostics at the same line. */
static int last_syntax_error_line = -1;
static char last_syntax_error_msg[256];

/*
 * Test-only capture hooks (default off for the production parser CLI).
 *
 * Expression capture (M4.2.5): when enabled, the first expr_stmt transfers the
 * raw expression tree into compilecraft_expr_capture and yields a NULL
 * statement (no AST_EXPR_STMT / shared ownership). The harness frees it.
 *
 * Program capture (M4.2.6): when enabled, a successful program reduction
 * transfers the AST_PROGRAM root into compilecraft_program_capture instead of
 * freeing it. Production parses still construct then free the tree so the
 * default CLI stays leak-free without a public --ast option.
 */
int compilecraft_capture_expr_enable = 0;
AstNode *compilecraft_expr_capture = NULL;
int compilecraft_capture_program_enable = 0;
AstNode *compilecraft_program_capture = NULL;
%}

/* Expose AST types to parser.tab.h (and thus the parser-linked lexer). */
%code requires {
#include "ast.h"
}

/* Semantic Value Types (docs/ast.md §12.1) */
%union {
    int ival;
    double fval;
    int bval;
    char *sval;
    AstNode *node;
    AstTypeTag type_tag;
    AstList list;
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

/* Nonterminal semantic types (docs/ast.md §12.2).
 * M4.2.6: expressions and statements build real nodes; recovery yields NULL.
 */
%type <node> program statement var_decl_stmt assign_stmt if_stmt while_stmt
%type <node> print_stmt block_stmt expr_stmt error_stmt expression
%type <list> statement_list
%type <type_tag> type_spec

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

/*
 * Destructors run only when Bison discards a symbol (error recovery / unwind).
 * They must not free values already transferred into a parent on a successful
 * reduce (RHS symbols are not destroyed after a reduce — the action owns them).
 */
%destructor { free($$); } <sval>
%destructor { ast_free($$); } <node>
%destructor { ast_free($$.head); } <list>

%start program

%%

/* ==============================================================================
 * Grammar Rules
 * ============================================================================== */

/* 1. Program & Statements
 * Top-level error production recovers at EOF after an incomplete construct
 * (e.g. missing closing brace) without inventing phantom statements.
 *
 * M4.2.6: successful program builds AST_PROGRAM; $$ is always left NULL so the
 * typed start symbol never double-owns the tree. Capture (test-only) or
 * ast_free (production) takes the sole remaining ownership.
 */
program:
    statement_list
    {
        AstNode *prog = ast_program($1, @$.first_line, @$.first_column);
        /* ast_program consumed $1 (owns list on success, frees it on failure). */
        if (compilecraft_capture_program_enable &&
            compilecraft_program_capture == NULL &&
            prog != NULL) {
            compilecraft_program_capture = prog;
        } else {
            ast_free(prog);
        }
        $$ = NULL;
    }
  | statement_list error
    {
        /* Do not fabricate a program root from a recovered error. */
        ast_free($1.head);
        yyerrok;
        $$ = NULL;
    }
  ;

statement_list:
    statement_list statement
    {
        $$ = $1;
        if ($2 != NULL) {
            /*
             * Success: destination list owns $2.
             * Failure with in_stmt_list: another list already owns $2 — do not free.
             * Failure otherwise: parser action still owns $2 — free it.
             * Rejected append leaves $$ unchanged (ast_list_append contract).
             */
            if (!ast_list_append(&$$, $2)) {
                if (!$2->in_stmt_list) {
                    ast_free($2);
                }
            }
        }
        /* NULL statements (recovery placeholders) are skipped intentionally. */
    }
  | %empty
    {
        $$ = ast_list_empty();
    }
  ;

statement:
    var_decl_stmt   { $$ = $1; }
  | assign_stmt     { $$ = $1; }
  | if_stmt         { $$ = $1; }
  | while_stmt      { $$ = $1; }
  | print_stmt      { $$ = $1; }
  | block_stmt      { $$ = $1; }
  | expr_stmt       { $$ = $1; }
  | SEMICOLON
    {
        $$ = ast_empty_stmt(@1.first_line, @1.first_column);
    }
  | error_stmt      { $$ = $1; }
  ;

/* 2. Variable Declarations (Section 5.1, 5.2, DEC-01)
 * Name string ownership: IDENTIFIER sval → ast_identifier → AST_VAR_DECL.
 * On any constructor failure the failing API frees its would-be children.
 */
var_decl_stmt:
    type_spec IDENTIFIER SEMICOLON
    {
        AstNode *name = ast_identifier($2, @2.first_line, @2.first_column);
        $$ = ast_var_decl($1, name, NULL, @$.first_line, @$.first_column);
    }
  | type_spec IDENTIFIER ASSIGN expression SEMICOLON
    {
        AstNode *name = ast_identifier($2, @2.first_line, @2.first_column);
        $$ = ast_var_decl($1, name, $4, @$.first_line, @$.first_column);
    }
  ;

type_spec:
    KW_INT    { $$ = AST_TYPE_INT; }
  | KW_FLOAT  { $$ = AST_TYPE_FLOAT; }
  | KW_BOOL   { $$ = AST_TYPE_BOOL; }
  ;

/* 3. Assignment Statements (Section 5.2)
 * Target is an AST_IDENTIFIER child (docs/ast.md). sval ownership transfers
 * into that node; value expression ownership transfers into AST_ASSIGN.
 */
assign_stmt:
    IDENTIFIER ASSIGN expression SEMICOLON
    {
        AstNode *target = ast_identifier($1, @1.first_line, @1.first_column);
        $$ = ast_assign(target, $3, @$.first_line, @$.first_column);
    }
  ;

/* 4. Expression Statements
 * Default: wrap expression in AST_EXPR_STMT (takes ownership of $1).
 * Expr-capture tests: transfer $1 to compilecraft_expr_capture and yield NULL
 * so the expression is not also owned by an ExprStmt / program list.
 */
expr_stmt:
    expression SEMICOLON
    {
        if (compilecraft_capture_expr_enable &&
            compilecraft_expr_capture == NULL &&
            $1 != NULL) {
            compilecraft_expr_capture = $1;
            $$ = NULL;
        } else {
            $$ = ast_expr_stmt($1, @$.first_line, @$.first_column);
        }
    }
  ;

/* 5. Compound Block Statements (Section 5.2, DEC-05)
 * Brace synchronization: recover malformed content inside a block at '}'.
 * Recovery does not fabricate a Block node.
 */
block_stmt:
    LBRACE statement_list RBRACE
    {
        $$ = ast_block($2, @$.first_line, @$.first_column);
    }
  | LBRACE statement_list error RBRACE
    {
        ast_free($2.head);
        yyerrok;
        $$ = NULL;
    }
  ;

/* 6. Control Flow Statements (Section 5.2)
 * Condition recovery: sync at ')' so an empty/malformed condition does not
 * cascade into a spurious brace diagnostic for the following statement body.
 * Recovery productions free any valid body nodes and yield NULL (no If/While).
 */
if_stmt:
    KW_IF LPAREN expression RPAREN statement %prec LOWER_THAN_ELSE
    {
        $$ = ast_if($3, $5, NULL, @$.first_line, @$.first_column);
    }
  | KW_IF LPAREN expression RPAREN statement KW_ELSE statement
    {
        $$ = ast_if($3, $5, $7, @$.first_line, @$.first_column);
    }
  | KW_IF LPAREN error RPAREN statement %prec LOWER_THAN_ELSE
    {
        yyerrok;
        if ($5 != NULL) {
            ast_free($5);
        }
        $$ = NULL;
    }
  | KW_IF LPAREN error RPAREN statement KW_ELSE statement
    {
        yyerrok;
        if ($5 != NULL) {
            ast_free($5);
        }
        if ($7 != NULL) {
            ast_free($7);
        }
        $$ = NULL;
    }
  ;

while_stmt:
    KW_WHILE LPAREN expression RPAREN statement
    {
        $$ = ast_while($3, $5, @$.first_line, @$.first_column);
    }
  | KW_WHILE LPAREN error RPAREN statement
    {
        yyerrok;
        if ($5 != NULL) {
            ast_free($5);
        }
        $$ = NULL;
    }
  ;

/* 7. Output Statements (Section 5.2, DEC-06) */
print_stmt:
    KW_PRINT expression SEMICOLON
    {
        $$ = ast_print_stmt($2, @$.first_line, @$.first_column);
    }
  ;

/* 8. Error Recovery Statement (Section 4.2, DEC-10)
 * Semicolon synchronization: discard tokens until ';' then resume.
 * No fabricated statement node.
 */
error_stmt:
    error SEMICOLON
    {
        yyerrok;
        $$ = NULL;
    }
  ;

/* 9. Expressions (Section 5.3, DEC-12) — M4.2.5 real AST construction
 *
 * Ownership: constructors take ownership of required children / identifier
 * strings on success, and free those arguments on failure (return NULL).
 * Successful reduces do not run %destructor on RHS symbols — do not free
 * children again after a successful transfer into $$ .
 *
 * Locations: literals/identifiers use the token (@1); unary uses the operator
 * token (@1); binary uses the start of the reduced expression (@$); parens
 * are transparent (no node; keep the inner node's location).
 */
expression:
    expression PLUS expression
    {
        $$ = ast_binary(AST_OP_ADD, $1, $3, @$.first_line, @$.first_column);
    }
  | expression MINUS expression
    {
        $$ = ast_binary(AST_OP_SUB, $1, $3, @$.first_line, @$.first_column);
    }
  | expression STAR expression
    {
        $$ = ast_binary(AST_OP_MUL, $1, $3, @$.first_line, @$.first_column);
    }
  | expression SLASH expression
    {
        $$ = ast_binary(AST_OP_DIV, $1, $3, @$.first_line, @$.first_column);
    }
  | expression MOD expression
    {
        $$ = ast_binary(AST_OP_MOD, $1, $3, @$.first_line, @$.first_column);
    }
  | expression EQ expression
    {
        $$ = ast_binary(AST_OP_EQ, $1, $3, @$.first_line, @$.first_column);
    }
  | expression NE expression
    {
        $$ = ast_binary(AST_OP_NE, $1, $3, @$.first_line, @$.first_column);
    }
  | expression LT expression
    {
        $$ = ast_binary(AST_OP_LT, $1, $3, @$.first_line, @$.first_column);
    }
  | expression GT expression
    {
        $$ = ast_binary(AST_OP_GT, $1, $3, @$.first_line, @$.first_column);
    }
  | expression LE expression
    {
        $$ = ast_binary(AST_OP_LE, $1, $3, @$.first_line, @$.first_column);
    }
  | expression GE expression
    {
        $$ = ast_binary(AST_OP_GE, $1, $3, @$.first_line, @$.first_column);
    }
  | expression AND expression
    {
        $$ = ast_binary(AST_OP_AND, $1, $3, @$.first_line, @$.first_column);
    }
  | expression OR expression
    {
        $$ = ast_binary(AST_OP_OR, $1, $3, @$.first_line, @$.first_column);
    }
  | NOT expression
    {
        $$ = ast_unary(AST_OP_NOT, $2, @1.first_line, @1.first_column);
    }
  | MINUS expression %prec UMINUS
    {
        $$ = ast_unary(AST_OP_NEG, $2, @1.first_line, @1.first_column);
    }
  | LPAREN expression RPAREN
    {
        /* Parentheses are not AST nodes (docs/ast.md §4). */
        $$ = $2;
    }
  | IDENTIFIER
    {
        /* ast_identifier takes ownership of $1; on failure it frees $1. */
        $$ = ast_identifier($1, @1.first_line, @1.first_column);
    }
  | INT_LITERAL
    {
        $$ = ast_literal_int($1, @1.first_line, @1.first_column);
    }
  | FLOAT_LITERAL
    {
        $$ = ast_literal_float($1, @1.first_line, @1.first_column);
    }
  | KW_TRUE
    {
        $$ = ast_literal_bool($1, @1.first_line, @1.first_column);
    }
  | KW_FALSE
    {
        $$ = ast_literal_bool($1, @1.first_line, @1.first_column);
    }
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
