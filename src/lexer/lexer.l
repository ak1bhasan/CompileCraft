%{
/* ==============================================================================
 * CompileCraft - Lexical Analyzer Specification (Flex)
 * Conforms to Section 4.1, 5.3, and 5.4 of the Language Specification
 *
 * Milestone 4.2.3: Source location tracking for the parser-linked build.
 * When compiled with Bison's parser.tab.h first (YYLTYPE_IS_DECLARED),
 * YY_USER_ACTION maintains 1-based inclusive yylloc spans. The standalone
 * lexer build does not include parser.tab.h, so location code is inactive.
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "tokens.h"

int lexical_error_count = 0;
static int comment_start_line = 1;

/*
 * Parser-linked location state (gated on YYLTYPE from parser.tab.h).
 *
 * Column policy:
 *   - Positions are 1-based and inclusive (last_column is the final character).
 *   - Every non-newline character, including tab and space, advances one column.
 *   - LF (\n) and lone CR (\r) each start a new line at column 1.
 *   - CRLF (\r\n) counts as a single line break: CR is ignored for advance,
 *     LF performs the break (also matched as one pattern where possible).
 */
#if defined(YYLTYPE_IS_DECLARED)

static int cc_loc_line = 1;
static int cc_loc_column = 1;

void compilecraft_loc_reset(void) {
    cc_loc_line = 1;
    cc_loc_column = 1;
    yylloc.first_line = 1;
    yylloc.first_column = 1;
    yylloc.last_line = 1;
    yylloc.last_column = 1;
}

static void cc_loc_set_eof(void) {
    yylloc.first_line = cc_loc_line;
    yylloc.first_column = cc_loc_column;
    yylloc.last_line = cc_loc_line;
    yylloc.last_column = cc_loc_column;
}

static void cc_yy_user_action(void) {
    int i;

    yylloc.first_line = cc_loc_line;
    yylloc.first_column = cc_loc_column;

    if (yyleng <= 0) {
        yylloc.last_line = cc_loc_line;
        yylloc.last_column = cc_loc_column;
        return;
    }

    for (i = 0; i < yyleng; i++) {
        unsigned char c = (unsigned char)yytext[i];

        /* Inclusive: current character occupies (cc_loc_line, cc_loc_column). */
        yylloc.last_line = cc_loc_line;
        yylloc.last_column = cc_loc_column;

        if (c == '\r') {
            /*
             * CRLF is normally one Flex match (\r\n). When both bytes appear in
             * yytext, ignore CR for advance and let LF break the line once.
             * A lone CR (end of yytext or not followed by LF) is its own break.
             */
            if (i + 1 < yyleng && yytext[i + 1] == '\n') {
                continue;
            }
            cc_loc_line++;
            cc_loc_column = 1;
        } else if (c == '\n') {
            cc_loc_line++;
            cc_loc_column = 1;
        } else {
            cc_loc_column++;
        }
    }
}

#define YY_USER_ACTION cc_yy_user_action();

#else /* !YYLTYPE_IS_DECLARED — standalone lexer */

void compilecraft_loc_reset(void) {
    /* No-op: standalone lexer has no YYLTYPE / yylloc. */
}

#endif /* YYLTYPE_IS_DECLARED */
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
     * Newlines accept CRLF as a single line break for location tracking.
     * -------------------------------------------------------------------------- */

"//"[^\r\n]*            { /* Single-line comment: stop before CR or LF */ }

"/*"                    { comment_start_line = yylineno; BEGIN(COMMENT); }
<COMMENT>"*/"           { BEGIN(INITIAL); }
<COMMENT>\r\n           { /* CRLF inside block comment: one line break */ }
<COMMENT>\n             { /* LF inside block comment */ }
<COMMENT>\r             { /* lone CR inside block comment */ }
<COMMENT>.              { /* Discard comment characters */ }
<COMMENT><<EOF>>        {
#if defined(YYLTYPE_IS_DECLARED)
                            cc_loc_set_eof();
#endif
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Unterminated block comment\n", comment_start_line);
                            fflush(stderr);
                            lexical_error_count++;
                            BEGIN(INITIAL);
                            return 0;
                        }

[ \t]+                  { /* Horizontal whitespace: space and tab (1 column each) */ }
\r\n                    { /* CRLF: one logical newline */ }
\n                      { /* LF newline */ }
\r                      { /* Lone CR newline */ }

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

<<EOF>>                 {
#if defined(YYLTYPE_IS_DECLARED)
                            cc_loc_set_eof();
#endif
                            return 0;
                        }

%%
