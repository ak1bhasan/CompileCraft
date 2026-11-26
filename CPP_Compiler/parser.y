%{
/* ==============================================================================
 * CompileCraft - C++ Procedural Subset LALR(1) Grammar (GNU Bison) — Milestone 10
 *
 * Integrates with CPP_Compiler/lexer.l and builds shared AST nodes (src/ast).
 * for-loops lower to Block { init; While { cond; Block { body; update } } }
 * so scope, semantics, and TAC reuse existing visitors.
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cpp_parser.tab.h"
#include "tokens.h"
#include "ast.h"

extern int yylex(void);
extern int yylineno;
extern int cpp_lexical_error_count;
extern FILE *yyin;
extern int syntax_error_count;

void yyerror(const char *msg);

static int last_syntax_error_line = -1;
static char last_syntax_error_msg[256];

AstNode *compilecraft_cpp_ast_root = NULL;

static char *cpp_strdup(const char *s) {
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
static AstNode *cpp_inc_dec_assign(char *name_owned, int is_inc, int line, int column) {
    char *rhs_copy;
    AstNode *target;
    AstNode *lhs;
    AstNode *one;
    AstNode *binop;
    AstNode *assign;

    if (!name_owned) {
        return NULL;
    }

    rhs_copy = cpp_strdup(name_owned);
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
static AstNode *cpp_lower_for(AstNode *init, AstNode *cond, AstNode *update,
                             AstNode *body, int line, int column) {
    AstList outer = ast_list_empty();
    AstList inner = ast_list_empty();
    AstNode *inner_block;
    AstNode *while_node;
    AstNode *outer_block;

    if (!cond) {
        cond = ast_literal_bool(1, line, column);
        if (!cond) {
            ast_free(init);
            ast_free(update);
            ast_free(body);
            return NULL;
        }
    }

    if (body) {
        if (!ast_list_append(&inner, body)) {
            if (!body->in_stmt_list) {
                ast_free(body);
            }
            ast_free(init);
            ast_free(cond);
            ast_free(update);
            ast_free(inner.head);
            return NULL;
        }
    }

    if (update) {
        if (!ast_list_append(&inner, update)) {
            if (!update->in_stmt_list) {
                ast_free(update);
            }
            ast_free(init);
            ast_free(cond);
            ast_free(inner.head);
            return NULL;
        }
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

    if (init) {
        if (!ast_list_append(&outer, init)) {
            if (!init->in_stmt_list) {
                ast_free(init);
            }
            ast_free(while_node);
            return NULL;
        }
    }

    if (!ast_list_append(&outer, while_node)) {
        if (!while_node->in_stmt_list) {
            ast_free(while_node);
        }
        ast_free(outer.head);
        return NULL;
    }

    outer_block = ast_block(outer, line, column);
    return outer_block;
}

/* Append an expression or std::endl cleanly to an AstList of AST_OUTPUT nodes
 * without directly mutating internal list fields outside ast.c. */
static int cpp_append_cout_newline(AstList *chain, int op_line, int op_column) {
    AstNode *last;
    AstNode *out_node;

    if (!chain) {
        return 0;
    }

    last = chain->tail;
    if (last && last->kind == AST_OUTPUT && !last->u.output_stmt.newline) {
        return ast_output_set_newline(last, 1);
    }

    out_node = ast_output(ast_list_empty(), 1, op_line, op_column);
    if (!out_node || !ast_list_append(chain, out_node)) {
        if (out_node && !out_node->in_stmt_list) {
            ast_free(out_node);
        }
        return 0;
    }

    return 1;
}

static int cpp_chain_cout_expr(AstList *chain, AstNode *expr, int line, int column) {
    AstNode *last;
    AstList items;
    AstNode *out_node;

    if (!chain || !expr) {
        ast_free(expr);
        return 0;
    }

    if (expr->kind == AST_IDENTIFIER && expr->u.identifier.name &&
        strcmp(expr->u.identifier.name, "endl") == 0) {
        ast_free(expr);
        return cpp_append_cout_newline(chain, line, column);
    }

    last = chain->tail;
    if (last && last->kind == AST_OUTPUT && !last->u.output_stmt.newline) {
        if (!ast_output_append_item(last, expr)) {
            if (!expr->in_stmt_list) {
                ast_free(expr);
            }
            return 0;
        }
        return 1;
    }

    items = ast_list_empty();
    if (!ast_list_append(&items, expr)) {
        if (!expr->in_stmt_list) {
            ast_free(expr);
        }
        return 0;
    }

    out_node = ast_output(items, 0, line, column);
    if (!out_node || !ast_list_append(chain, out_node)) {
        if (out_node && !out_node->in_stmt_list) {
            ast_free(out_node);
        }
        return 0;
    }

    return 1;
}

static int cpp_chain_cout_endl(AstList *chain, char *ns, int ns_line,
                               char *member, int op_line, int op_column) {
    int valid_endl = (ns && member && strcmp(ns, "std") == 0 && strcmp(member, "endl") == 0);

    if (!valid_endl) {
        fprintf(stderr,
                "Syntax Error at line %d: Unsupported stream manipulator '%s::%s' (expected 'std::endl')\n",
                ns_line, ns ? ns : "", member ? member : "");
        syntax_error_count++;
        free(ns);
        free(member);
        return 1;
    }

    free(ns);
    free(member);
    return cpp_append_cout_newline(chain, op_line, op_column);
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

/* Token values match CPP_Compiler/tokens.def */
%token KW_INT          258
%token KW_FLOAT        259
%token KW_DOUBLE       260
%token KW_CHAR         261
%token KW_VOID         262
%token KW_BOOL         263
%token <bval> KW_TRUE  264
%token <bval> KW_FALSE 265
%token KW_IF           266
%token KW_ELSE         267
%token KW_WHILE        268
%token KW_FOR          269
%token KW_RETURN       270
%token KW_BREAK        271
%token KW_CONTINUE     272
%token KW_CLASS        273
%token KW_PUBLIC       274
%token KW_PRIVATE      275
%token KW_PROTECTED    276
%token KW_NEW          277
%token KW_DELETE       278
%token KW_THIS         279

%token <sval> IDENTIFIER      280
%token <ival> INT_LITERAL     281
%token <fval> FLOAT_LITERAL   282
%token <cval> CHAR_LITERAL    283
%token <sval> STRING_LITERAL  284

%token SCOPE           285
%token DOT             286
%token ARROW           287
%token LSHIFT          288
%token RSHIFT          289

%token PLUS            290
%token MINUS           291
%token STAR            292
%token SLASH           293
%token MOD             294

%token LT              295
%token GT              296
%token LE              297
%token GE              298
%token EQ              299
%token NE              300

%token AND             301
%token OR              302
%token NOT             303

%token ASSIGN          304
%token PLUS_ASSIGN     305
%token MINUS_ASSIGN    306
%token STAR_ASSIGN     307
%token SLASH_ASSIGN    308
%token MOD_ASSIGN      309

%token INC             310
%token DEC             311

%token LBRACE          312
%token RBRACE          313
%token LPAREN          314
%token RPAREN          315
%token LBRACKET        316
%token RBRACKET        317
%token SEMICOLON       318
%token COMMA           319
%token COLON           320

%type <node> program main_function statement var_decl_stmt assign_stmt
%type <node> if_stmt while_stmt for_stmt block_stmt expr_stmt error_stmt
%type <node> return_stmt inc_dec_stmt output_stmt expression
%type <node> for_init for_cond for_update
%type <list> statement_list cout_chain cin_chain
%type <type_tag> type_spec

%nonassoc LOWER_THAN_ELSE 330
%nonassoc KW_ELSE

%left     OR
%left     AND
%left     EQ NE
%left     LT GT LE GE
%left     PLUS MINUS
%left     STAR SLASH MOD
%right    NOT
%right    UMINUS 331
%right    INC DEC

%destructor { free($$); } <sval>
%destructor { ast_free($$); } <node>
%destructor { ast_free($$.head); } <list>

%start program

%%

program:
    using_list main_function
    {
        compilecraft_cpp_ast_root = $2;
        $$ = NULL;
    }
  | using_list main_function error
    {
        ast_free($2);
        compilecraft_cpp_ast_root = NULL;
        yyerrok;
        $$ = NULL;
    }
  ;

using_list:
    %empty
  | using_list IDENTIFIER IDENTIFIER IDENTIFIER SEMICOLON
    {
        if (!$2 || !$3 || !$4 ||
            strcmp($2, "using") != 0 ||
            strcmp($3, "namespace") != 0 ||
            strcmp($4, "std") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported directive '%s %s %s;' (only 'using namespace std;' is supported)\n",
                    @2.first_line, $2 ? $2 : "", $3 ? $3 : "", $4 ? $4 : "");
            syntax_error_count++;
        }
        free($2);
        free($3);
        free($4);
    }
  ;

/* int main(void) { ... }  or  int main() { ... } */
main_function:
    KW_INT IDENTIFIER LPAREN main_params RPAREN block_stmt
    {
        AstNode *body = $6;
        AstList stmts;

        if (!$2 || strcmp($2, "main") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: C++ subset entry point must be named 'main'\n",
                    @2.first_line);
            syntax_error_count++;
            free($2);
            ast_free(body);
            $$ = NULL;
        } else if (!body || body->kind != AST_BLOCK) {
            free($2);
            ast_free(body);
            $$ = NULL;
        } else {
            free($2);
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

main_params:
    %empty
  | KW_VOID
  ;

statement_list:
    statement_list statement
    {
        $$ = $1;
        if ($2 != NULL) {
            if (!ast_list_append(&$$, $2)) {
                if (!$2->in_stmt_list) {
                    ast_free($2);
                }
            }
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
    KW_INT    { $$ = AST_TYPE_INT; }
  | KW_FLOAT  { $$ = AST_TYPE_FLOAT; }
  | KW_BOOL   { $$ = AST_TYPE_BOOL; }
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
  | IDENTIFIER IDENTIFIER SEMICOLON
    {
        if (!$1 || strcmp($1, "string") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported type '%s' (expected int, float, bool, or string)\n",
                    @1.first_line, $1 ? $1 : "");
            syntax_error_count++;
            free($1);
            free($2);
            $$ = NULL;
        } else {
            AstNode *name = ast_identifier($2, @2.first_line, @2.first_column);
            free($1);
            $$ = ast_var_decl(AST_TYPE_STRING, name, NULL, @$.first_line, @$.first_column);
        }
    }
  | IDENTIFIER IDENTIFIER ASSIGN expression SEMICOLON
    {
        if (!$1 || strcmp($1, "string") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported type '%s' (expected int, float, bool, or string)\n",
                    @1.first_line, $1 ? $1 : "");
            syntax_error_count++;
            free($1);
            free($2);
            ast_free($4);
            $$ = NULL;
        } else {
            AstNode *name = ast_identifier($2, @2.first_line, @2.first_column);
            free($1);
            $$ = ast_var_decl(AST_TYPE_STRING, name, $4, @$.first_line, @$.first_column);
        }
    }
  | IDENTIFIER SCOPE IDENTIFIER IDENTIFIER SEMICOLON
    {
        if (!$1 || !$3 || strcmp($1, "std") != 0 || strcmp($3, "string") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported qualified type '%s::%s'\n",
                    @1.first_line, $1 ? $1 : "", $3 ? $3 : "");
            syntax_error_count++;
            free($1);
            free($3);
            free($4);
            $$ = NULL;
        } else {
            AstNode *name = ast_identifier($4, @4.first_line, @4.first_column);
            free($1);
            free($3);
            $$ = ast_var_decl(AST_TYPE_STRING, name, NULL, @$.first_line, @$.first_column);
        }
    }
  | IDENTIFIER SCOPE IDENTIFIER IDENTIFIER ASSIGN expression SEMICOLON
    {
        if (!$1 || !$3 || strcmp($1, "std") != 0 || strcmp($3, "string") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported qualified type '%s::%s'\n",
                    @1.first_line, $1 ? $1 : "", $3 ? $3 : "");
            syntax_error_count++;
            free($1);
            free($3);
            free($4);
            ast_free($6);
            $$ = NULL;
        } else {
            AstNode *name = ast_identifier($4, @4.first_line, @4.first_column);
            free($1);
            free($3);
            $$ = ast_var_decl(AST_TYPE_STRING, name, $6, @$.first_line, @$.first_column);
        }
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

cout_chain:
    LSHIFT IDENTIFIER SCOPE IDENTIFIER
    {
        $$ = ast_list_empty();
        if (!cpp_chain_cout_endl(&$$, $2, @2.first_line, $4,
                                 @1.first_line, @1.first_column)) {
            syntax_error_count++;
            ast_free($$.head);
            $$ = ast_list_empty();
        }
    }
  | LSHIFT expression
    {
        $$ = ast_list_empty();
        if ($2 != NULL &&
            !cpp_chain_cout_expr(&$$, $2, @2.first_line, @2.first_column)) {
            syntax_error_count++;
            ast_free($$.head);
            $$ = ast_list_empty();
        }
    }
  | cout_chain LSHIFT IDENTIFIER SCOPE IDENTIFIER
    {
        $$ = $1;
        if (!cpp_chain_cout_endl(&$$, $3, @3.first_line, $5,
                                 @2.first_line, @2.first_column)) {
            syntax_error_count++;
            ast_free($$.head);
            $$ = ast_list_empty();
        }
    }
  | cout_chain LSHIFT expression
    {
        $$ = $1;
        if ($3 != NULL &&
            !cpp_chain_cout_expr(&$$, $3, @3.first_line, @3.first_column)) {
            syntax_error_count++;
            ast_free($$.head);
            $$ = ast_list_empty();
        }
    }
  ;

cin_chain:
    RSHIFT expression
    {
        $$ = ast_list_empty();
        if ($2 != NULL && !ast_list_append(&$$, $2)) {
            if (!$2->in_stmt_list) {
                ast_free($2);
            }
        }
    }
  | cin_chain RSHIFT expression
    {
        $$ = $1;
        if ($3 != NULL && !ast_list_append(&$$, $3)) {
            if (!$3->in_stmt_list) {
                ast_free($3);
            }
        }
    }
  ;

output_stmt:
    IDENTIFIER SCOPE IDENTIFIER cout_chain SEMICOLON
    {
        if (!$1 || !$3 || strcmp($1, "std") != 0 || strcmp($3, "cout") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported qualified stream '%s::%s' (expected 'std::cout')\n",
                    @1.first_line, $1 ? $1 : "", $3 ? $3 : "");
            syntax_error_count++;
            free($1);
            free($3);
            ast_free($4.head);
            $$ = NULL;
        } else {
            AstNode *single;
            free($1);
            free($3);
            if ($4.head == NULL) {
                $$ = NULL;
            } else if ((single = ast_list_take_single(&$4)) != NULL) {
                $$ = single;
            } else {
                $$ = ast_seq($4, @$.first_line, @$.first_column);
            }
        }
    }
  | IDENTIFIER cout_chain SEMICOLON
    {
        if (!$1 || strcmp($1, "cout") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported output stream '%s' (expected 'cout' or 'std::cout')\n",
                    @1.first_line, $1 ? $1 : "");
            syntax_error_count++;
            free($1);
            ast_free($2.head);
            $$ = NULL;
        } else {
            AstNode *single;
            free($1);
            if ($2.head == NULL) {
                $$ = NULL;
            } else if ((single = ast_list_take_single(&$2)) != NULL) {
                $$ = single;
            } else {
                $$ = ast_seq($2, @$.first_line, @$.first_column);
            }
        }
    }
  | IDENTIFIER SCOPE IDENTIFIER cin_chain SEMICOLON
    {
        if (!$1 || !$3 || strcmp($1, "std") != 0 || strcmp($3, "cin") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported qualified input stream '%s::%s' (expected 'std::cin')\n",
                    @1.first_line, $1 ? $1 : "", $3 ? $3 : "");
            syntax_error_count++;
            free($1);
            free($3);
            ast_free($4.head);
            $$ = NULL;
        } else {
            free($1);
            free($3);
            $$ = ast_input($4, AST_INPUT_CIN, @$.first_line, @$.first_column);
        }
    }
  | IDENTIFIER cin_chain SEMICOLON
    {
        if (!$1 || strcmp($1, "cin") != 0) {
            fprintf(stderr,
                    "Syntax Error at line %d: Unsupported input stream '%s' (expected 'cin' or 'std::cin')\n",
                    @1.first_line, $1 ? $1 : "");
            syntax_error_count++;
            free($1);
            ast_free($2.head);
            $$ = NULL;
        } else {
            free($1);
            $$ = ast_input($2, AST_INPUT_CIN, @$.first_line, @$.first_column);
        }
    }
  | IDENTIFIER SCOPE IDENTIFIER error SEMICOLON
    {
        free($1);
        free($3);
        yyerrok;
        $$ = NULL;
    }
  ;

inc_dec_stmt:
    IDENTIFIER INC SEMICOLON
    {
        $$ = cpp_inc_dec_assign($1, 1, @$.first_line, @$.first_column);
    }
  | IDENTIFIER DEC SEMICOLON
    {
        $$ = cpp_inc_dec_assign($1, 0, @$.first_line, @$.first_column);
    }
  | INC IDENTIFIER SEMICOLON
    {
        $$ = cpp_inc_dec_assign($2, 1, @$.first_line, @$.first_column);
    }
  | DEC IDENTIFIER SEMICOLON
    {
        $$ = cpp_inc_dec_assign($2, 0, @$.first_line, @$.first_column);
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

for_stmt:
    KW_FOR LPAREN for_init SEMICOLON for_cond SEMICOLON for_update RPAREN statement
    {
        $$ = cpp_lower_for($3, $5, $7, $9, @$.first_line, @$.first_column);
    }
  | KW_FOR LPAREN error RPAREN statement
    {
        yyerrok;
        if ($5 != NULL) {
            ast_free($5);
        }
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
        $$ = cpp_inc_dec_assign($1, 1, @$.first_line, @$.first_column);
    }
  | IDENTIFIER DEC
    {
        $$ = cpp_inc_dec_assign($1, 0, @$.first_line, @$.first_column);
    }
  | INC IDENTIFIER
    {
        $$ = cpp_inc_dec_assign($2, 1, @$.first_line, @$.first_column);
    }
  | DEC IDENTIFIER
    {
        $$ = cpp_inc_dec_assign($2, 0, @$.first_line, @$.first_column);
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
