%{
/* ==============================================================================
 * CompileCraft - Lexical Analyzer Specification (Flex)
 * Conforms to Section 4.1, 5.3, and 5.4 of the Language Specification
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "tokens.h"

int lexical_error_count = 0;
static int comment_start_line = 1;
%}

%option noyywrap
%option nounput
%option noinput
%option yylineno

/* Exclusive start condition for handling multiline block comments */
%x COMMENT

%%

    /* --------------------------------------------------------------------------
     * 1. Comments & Whitespace (Discarded per Section 4.1)
     * -------------------------------------------------------------------------- */

"//"[^\n]*              { /* Single-line comment: discard until end of line */ }

"/*"                    { comment_start_line = yylineno; BEGIN(COMMENT); }
<COMMENT>"*/"           { BEGIN(INITIAL); }
<COMMENT>\n             { /* yylineno handles newline tracking automatically */ }
<COMMENT>.              { /* Discard comment characters */ }
<COMMENT><<EOF>>        {
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Unterminated block comment\n", comment_start_line);
                            fflush(stderr);
                            lexical_error_count++;
                            BEGIN(INITIAL);
                            return 0;
                        }

[ \t\r]+                { /* Discard spaces, tabs, and carriage returns */ }
\n                      { /* Newlines handled by %option yylineno */ }

    /* --------------------------------------------------------------------------
     * 2. Keywords (Section 4.1, 5.1, 5.2)
     * Ordered before IDENTIFIER to leverage Flex's longest-match and rule priority
     * -------------------------------------------------------------------------- */

"int"                   { return KW_INT; }
"float"                 { return KW_FLOAT; }
"bool"                  { return KW_BOOL; }
"if"                    { return KW_IF; }
"else"                  { return KW_ELSE; }
"while"                 { return KW_WHILE; }
"print"                 { return KW_PRINT; }
"true"                  { yylval.bval = 1; return KW_TRUE; }
"false"                 { yylval.bval = 0; return KW_FALSE; }

    /* --------------------------------------------------------------------------
     * 3. Operators (Section 5.3)
     * Two-character operators ordered before single-character operators
     * -------------------------------------------------------------------------- */

"=="                    { return EQ; }
"!="                    { return NE; }
"<="                    { return LE; }
">="                    { return GE; }
"<"                     { return LT; }
">"                     { return GT; }

"&&"                    { return AND; }
"||"                    { return OR; }
"!"                     { return NOT; }

"+"                     { return PLUS; }
"-"                     { return MINUS; }
"*"                     { return STAR; }
"/"                     { return SLASH; }
"%"                     { return MOD; }

"="                     { return ASSIGN; }

    /* --------------------------------------------------------------------------
     * 4. Delimiters & Punctuation (Section 5.4)
     * -------------------------------------------------------------------------- */

"{"                     { return LBRACE; }
"}"                     { return RBRACE; }
"("                     { return LPAREN; }
")"                     { return RPAREN; }
";"                     { return SEMICOLON; }

    /* --------------------------------------------------------------------------
     * 5. Literals & Identifiers (Section 5.4)
     * Floating-point numbers require digits before and after the decimal point.
     * Identifiers must not absorb keyword prefixes when isolated.
     * -------------------------------------------------------------------------- */

[0-9]+\.[0-9]+          {
                            yylval.fval = atof(yytext);
                            return FLOAT_LITERAL;
                        }

[0-9]+                  {
                            yylval.ival = atoi(yytext);
                            return INT_LITERAL;
                        }

[a-zA-Z_][a-zA-Z0-9_]*  {
                            yylval.sval = strdup(yytext);
                            return IDENTIFIER;
                        }

    /* --------------------------------------------------------------------------
     * 6. Fallback Rule: Lexical Errors (Section 4.1)
     * Matches any unexpected character and reports error with line number
     * -------------------------------------------------------------------------- */

.                       {
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Unrecognized character '%c'\n",
                                    yylineno, yytext[0]);
                            fflush(stderr);
                            lexical_error_count++;
                        }

%%
