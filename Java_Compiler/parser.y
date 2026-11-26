%{
/* ==============================================================================
 * CompileCraft - Java Subset LALR(1) Grammar (GNU Bison) — Milestone 11
 *
 * Integrates with Java_Compiler/lexer.l and builds shared AST nodes (src/ast).
 * Entry wrapper (public? class Name { public static void main(String[] args) { ... } })
 * lowers directly to AST_PROGRAM. for-loops lower to:
 *   Block { init; While { cond; Block { body; update } } }
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "java_parser.tab.h"
#include "tokens.h"
#include "ast.h"

extern int yylex(void);
extern int yylineno;
extern int java_lexical_error_count;
extern FILE *yyin;
extern int syntax_error_count;

void yyerror(const char *msg);

static int last_syntax_error_line = -1;
static char last_syntax_error_msg[256];

AstNode *compilecraft_java_ast_root = NULL;

static char *java_strdup(const char *s) {
    size_t n;
    char *p;
    if (!s) {
        return NULL;
    }
    n = strlen(s) + 1;
    p = (char *)malloc(n);
    if (p) {
        memcpy(p, s, n);
    }
    return p;
}

/* Build assign: name = name +/- 1 (for ++ / --). Takes ownership of name_owned. */
static AstNode *java_inc_dec_assign(char *name_owned, int is_inc, int line, int column) {
    char *rhs_copy;
    AstNode *target;
    AstNode *lhs;
    AstNode *one;
    AstNode *binop;
    AstNode *assign;

    if (!name_owned) {
        return NULL;
    }

    rhs_copy = java_strdup(name_owned);
    if (!rhs_copy) {
        free(name_owned);
        return NULL;
    }

    target = ast_identifier(name_owned, line, column);
    lhs = ast_identifier(rhs_copy, line, column);
    one = ast_literal_int(1, line, column);
    if (!target || !lhs || !one) {
        ast_free(target);
        ast_free(lhs);
        ast_free(one);
        return NULL;
    }

    binop = ast_binary(is_inc ? AST_OP_ADD : AST_OP_SUB, lhs, one, line, column);
    if (!binop) {
        ast_free(target);
        return NULL;
    }

    assign = ast_assign(target, binop, line, column);
    return assign;
}

/* Append stmt into list, freeing stmt on failure if not already list-owned. */
static int java_append_owned(AstList *list, AstNode *stmt) {
    if (!ast_list_append(list, stmt)) {
        if (stmt && !stmt->in_stmt_list) {
            ast_free(stmt);
        }
        return 0;
    }
    return 1;
}

/*
 * Lower for to shared AST:
 *   Block {
 *     init;                  // optional
 *     While (cond) {         // missing cond => true
 *       Block {
 *         body;
 *         update;            // optional
 *       }
 *     }
 *   }
 * Outer block gives for-init declarations correct scope lifetime.
 */
static AstNode *java_lower_for(AstNode *init, AstNode *cond, AstNode *update,
                               AstNode *body, int line, int column) {
    AstList outer = ast_list_empty();
    AstList inner = ast_list_empty();
    AstNode *inner_block;
    AstNode *while_node;

    if (!cond) {
        cond = ast_literal_bool(1, line, column);
        if (!cond) {
            ast_free(init);
            ast_free(update);
            ast_free(body);
            return NULL;
        }
    }

    if (body && !java_append_owned(&inner, body)) {
        ast_free(init);
        ast_free(cond);
        ast_free(update);
        ast_free(inner.head);
        return NULL;
    }

    if (update && !java_append_owned(&inner, update)) {
        ast_free(init);
        ast_free(cond);
        ast_free(inner.head);
        return NULL;
    }

    inner_block = ast_block(inner, line, column);
    if (!inner_block) {
        ast_free(init);
        ast_free(cond);
        return NULL;
    }

    while_node = ast_while(cond, inner_block, line, column);
    if (!while_node) {
        ast_free(init);
        return NULL;
    }

    if (init && !java_append_owned(&outer, init)) {
        ast_free(while_node);
        return NULL;
    }

    if (!java_append_owned(&outer, while_node)) {
        ast_free(outer.head);
        return NULL;
    }

    return ast_block(outer, line, column);
}



%}

%code requires {
#include "ast.h"
}

%union {
    int ival;
    double fval;
    int bval;
    char cval;
    char *sval;
    AstNode *node;
    AstTypeTag type_tag;
    AstList list;
}

%locations

%define parse.error detailed
%define parse.lac full

/* Token values match Java_Compiler/tokens.def */
%token KW_INT          258
%token KW_FLOAT        259
%token KW_CHAR         260
%token KW_VOID         261
%token KW_BOOLEAN      262
%token <bval> KW_TRUE  263
%token <bval> KW_FALSE 264
%token KW_IF           265
%token KW_ELSE         266
%token KW_WHILE        267
%token KW_FOR          268
%token KW_RETURN       269
%token KW_CLASS        270
%token KW_PUBLIC       271
%token KW_STATIC       272
%token KW_NEW          273
%token KW_THIS         274

%token <sval> IDENTIFIER      275
%token <ival> INT_LITERAL     276
%token <fval> FLOAT_LITERAL   277
%token <cval> CHAR_LITERAL    278
%token <sval> STRING_LITERAL  279

%token DOT             280

%token PLUS            281
%token MINUS           282
%token STAR            283
%token SLASH           284
%token MOD             285

%token LT              286
%token GT              287
%token LE              288
%token GE              289
%token EQ              290
%token NE              291

%token AND             292
%token OR              293
%token NOT             294

%token ASSIGN          295
%token PLUS_ASSIGN     296
%token MINUS_ASSIGN    297
%token STAR_ASSIGN     298
%token SLASH_ASSIGN    299
%token MOD_ASSIGN      300

%token INC             301
%token DEC             302

%token LBRACE          303
%token RBRACE          304
%token LPAREN          305
%token RPAREN          306
%token LBRACKET        307
%token RBRACKET        308
%token SEMICOLON       309
%token COMMA           310

%type <node> program class_decl main_method statement var_decl_stmt assign_stmt
%type <node> if_stmt while_stmt for_stmt block_stmt expr_stmt error_stmt
%type <node> return_stmt inc_dec_stmt output_stmt expression
%type <node> for_init for_cond for_update
%type <list> statement_list
%type <type_tag> type_spec
%type <bval> main_param

%nonassoc LOWER_THAN_ELSE 320
%nonassoc KW_ELSE

%left     OR
%left     AND
%left     EQ NE
%left     LT GT LE GE
%left     PLUS MINUS
%left     STAR SLASH MOD
%right    NOT
%right    UMINUS 321
%right    INC DEC

%destructor { free($$); } <sval>
%destructor { ast_free($$); } <node>
%destructor { ast_free($$.head); } <list>

%start program

%%

program:
    class_decl
    {
        compilecraft_java_ast_root = $1;
        $$ = NULL;
    }
  | class_decl error
    {
        ast_free($1);
        compilecraft_java_ast_root = NULL;
        yyerrok;
        $$ = NULL;
    }
  ;

class_modifiers:
    %empty
  | KW_PUBLIC
  ;

/* [public] class Name { public static void main(String[] args) { ... } } */
class_decl:
    class_modifiers KW_CLASS IDENTIFIER LBRACE main_method RBRACE
    {
        free($3);
        $$ = $5;
    }
  | class_modifiers KW_CLASS IDENTIFIER LBRACE error RBRACE
    {
        free($3);
        yyerrok;
        $$ = NULL;
    }
  ;

main_method:
    KW_PUBLIC KW_STATIC KW_VOID IDENTIFIER LPAREN main_param RPAREN block_stmt
    {
        AstNode *body = $8;
        AstList stmts;

        if (!$4 || strcmp($4, "main") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Java subset entry point must be named 'main'\n",
                    @4.first_line);
            syntax_error_count++;
            free($4);
            ast_free(body);
            $$ = NULL;
        } else if (!$6 || !body || body->kind != AST_BLOCK) {
            free($4);
            ast_free(body);
            $$ = NULL;
        } else {
            free($4);
            /* Promote main body statements to AST_PROGRAM (shared pipeline). */
            stmts.head = body->u.block.stmts;
            stmts.tail = body->u.block.stmts_tail;
            body->u.block.stmts = NULL;
            body->u.block.stmts_tail = NULL;
            ast_free(body);
            $$ = ast_program(stmts, @$.first_line, @$.first_column);
        }
    }
  ;

main_param:
    IDENTIFIER LBRACKET RBRACKET IDENTIFIER
    {
        if (!$1 || strcmp($1, "String") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Java subset main parameter type must be 'String[]'\n",
                    @1.first_line);
            syntax_error_count++;
            $$ = 0;
        } else {
            $$ = 1;
        }
        free($1);
        free($4);
    }
  | IDENTIFIER IDENTIFIER LBRACKET RBRACKET
    {
        if (!$1 || strcmp($1, "String") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Java subset main parameter type must be 'String[]'\n",
                    @1.first_line);
            syntax_error_count++;
            $$ = 0;
        } else {
            $$ = 1;
        }
        free($1);
        free($2);
    }
  ;

statement_list:
    statement_list statement
    {
        $$ = $1;
        if ($2 != NULL) {
            java_append_owned(&$$, $2);
        }
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
  | for_stmt        { $$ = $1; }
  | block_stmt      { $$ = $1; }
  | output_stmt     { $$ = $1; }
  | expr_stmt       { $$ = $1; }
  | inc_dec_stmt    { $$ = $1; }
  | return_stmt     { $$ = $1; }
  | SEMICOLON
    {
        $$ = ast_empty_stmt(@1.first_line, @1.first_column);
    }
  | error_stmt      { $$ = $1; }
  ;

type_spec:
    KW_INT      { $$ = AST_TYPE_INT; }
  | KW_FLOAT    { $$ = AST_TYPE_FLOAT; }
  | KW_BOOLEAN  { $$ = AST_TYPE_BOOL; }
  ;

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

assign_stmt:
    IDENTIFIER ASSIGN expression SEMICOLON
    {
        AstNode *target = ast_identifier($1, @1.first_line, @1.first_column);
        $$ = ast_assign(target, $3, @$.first_line, @$.first_column);
    }
  ;

expr_stmt:
    expression SEMICOLON
    {
        $$ = ast_expr_stmt($1, @$.first_line, @$.first_column);
    }
  ;

output_stmt:
    IDENTIFIER DOT IDENTIFIER DOT IDENTIFIER LPAREN RPAREN SEMICOLON
    {
        int is_sys_out = ($1 && $3 && strcmp($1, "System") == 0 && strcmp($3, "out") == 0);
        if (!is_sys_out || !$5 || strcmp($5, "println") != 0) {
            if (is_sys_out && $5 && strcmp($5, "print") == 0) {
                fprintf(stderr,
                        "Syntax Error at line %d: 'System.out.print()' requires an argument\n",
                        @5.first_line);
            } else {
                fprintf(stderr,
                        "Syntax Error at line %d: Unsupported output call '%s.%s.%s()' (expected 'System.out.println()')\n",
                        @1.first_line, $1 ? $1 : "", $3 ? $3 : "", $5 ? $5 : "");
            }
            syntax_error_count++;
            free($1);
            free($3);
            free($5);
            $$ = NULL;
        } else {
            free($1);
            free($3);
            free($5);
            $$ = ast_output(ast_list_empty(), 1, @$.first_line, @$.first_column);
        }
    }
  | IDENTIFIER DOT IDENTIFIER DOT IDENTIFIER LPAREN expression RPAREN SEMICOLON
    {
        int is_sys_out = ($1 && $3 && strcmp($1, "System") == 0 && strcmp($3, "out") == 0);
        int is_print = ($5 && strcmp($5, "print") == 0);
        int is_println = ($5 && strcmp($5, "println") == 0);
        if (!is_sys_out || (!is_print && !is_println)) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported output call '%s.%s.%s' (expected 'System.out.print' or 'System.out.println')\n",
                    @1.first_line, $1 ? $1 : "", $3 ? $3 : "", $5 ? $5 : "");
            syntax_error_count++;
            free($1);
            free($3);
            free($5);
            ast_free($7);
            $$ = NULL;
        } else {
            AstList items = ast_list_empty();
            free($1);
            free($3);
            free($5);
            if (!$7 || !java_append_owned(&items, $7)) {
                ast_free(items.head);
                $$ = NULL;
            } else {
                $$ = ast_output_with_mode(
                    items,
                    AST_OUTPUT_CONCAT,
                    is_println ? 1 : 0,
                    @$.first_line,
                    @$.first_column);
            }
        }
    }
  | IDENTIFIER DOT IDENTIFIER DOT IDENTIFIER LPAREN error RPAREN SEMICOLON
    {
        free($1);
        free($3);
        free($5);
        yyerrok;
        $$ = NULL;
    }
  ;

inc_dec_stmt:
    IDENTIFIER INC SEMICOLON
    {
        $$ = java_inc_dec_assign($1, 1, @$.first_line, @$.first_column);
    }
  | IDENTIFIER DEC SEMICOLON
    {
        $$ = java_inc_dec_assign($1, 0, @$.first_line, @$.first_column);
    }
  | INC IDENTIFIER SEMICOLON
    {
        $$ = java_inc_dec_assign($2, 1, @$.first_line, @$.first_column);
    }
  | DEC IDENTIFIER SEMICOLON
    {
        $$ = java_inc_dec_assign($2, 0, @$.first_line, @$.first_column);
    }
  ;

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
        ast_free($5);
        $$ = NULL;
    }
  | KW_IF LPAREN error RPAREN statement KW_ELSE statement
    {
        yyerrok;
        ast_free($5);
        ast_free($7);
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
        ast_free($5);
        $$ = NULL;
    }
  ;

for_stmt:
    KW_FOR LPAREN for_init SEMICOLON for_cond SEMICOLON for_update RPAREN statement
    {
        $$ = java_lower_for($3, $5, $7, $9, @$.first_line, @$.first_column);
    }
  | KW_FOR LPAREN error RPAREN statement
    {
        yyerrok;
        ast_free($5);
        $$ = NULL;
    }
  ;

for_init:
    %empty
    {
        $$ = NULL;
    }
  | type_spec IDENTIFIER
    {
        AstNode *name = ast_identifier($2, @2.first_line, @2.first_column);
        $$ = ast_var_decl($1, name, NULL, @$.first_line, @$.first_column);
    }
  | type_spec IDENTIFIER ASSIGN expression
    {
        AstNode *name = ast_identifier($2, @2.first_line, @2.first_column);
        $$ = ast_var_decl($1, name, $4, @$.first_line, @$.first_column);
    }
  | IDENTIFIER ASSIGN expression
    {
        AstNode *target = ast_identifier($1, @1.first_line, @1.first_column);
        $$ = ast_assign(target, $3, @$.first_line, @$.first_column);
    }
  ;

for_cond:
    %empty
    {
        $$ = NULL;
    }
  | expression
    {
        $$ = $1;
    }
  ;

for_update:
    %empty
    {
        $$ = NULL;
    }
  | IDENTIFIER ASSIGN expression
    {
        AstNode *target = ast_identifier($1, @1.first_line, @1.first_column);
        $$ = ast_assign(target, $3, @$.first_line, @$.first_column);
    }
  | IDENTIFIER INC
    {
        $$ = java_inc_dec_assign($1, 1, @$.first_line, @$.first_column);
    }
  | IDENTIFIER DEC
    {
        $$ = java_inc_dec_assign($1, 0, @$.first_line, @$.first_column);
    }
  | INC IDENTIFIER
    {
        $$ = java_inc_dec_assign($2, 1, @$.first_line, @$.first_column);
    }
  | DEC IDENTIFIER
    {
        $$ = java_inc_dec_assign($2, 0, @$.first_line, @$.first_column);
    }
  ;

return_stmt:
    KW_RETURN SEMICOLON
    {
        $$ = ast_empty_stmt(@$.first_line, @$.first_column);
    }
  | KW_RETURN expression SEMICOLON
    {
        $$ = ast_expr_stmt($2, @$.first_line, @$.first_column);
    }
  ;

error_stmt:
    error SEMICOLON
    {
        yyerrok;
        $$ = NULL;
    }
  ;

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
        $$ = $2;
    }
  | IDENTIFIER
    {
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
  | STRING_LITERAL
    {
        $$ = ast_literal_string($1, @1.first_line, @1.first_column);
    }
  ;

%%

void yyerror(const char *msg) {
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
