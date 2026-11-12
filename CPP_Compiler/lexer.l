%{
/* ==============================================================================
 * CompileCraft - C++-Subset Lexical Analyzer Specification (Flex)
 * Conforming to ISO C++98/C++11 Object-Oriented Subset (docs/tokens_cpp.md)
 * ============================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include "tokens.h"

int cpp_lexical_error_count = 0;
static int comment_start_line = 1;

static int is_supported_escape(char c) {
    switch (c) {
        case 'n': case 't': case 'r': case '0':
        case '\\': case '\'': case '\"':
            return 1;
        default:
            return 0;
    }
}

static char parse_escape_char(char c) {
    switch (c) {
        case 'n':  return '\n';
        case 't':  return '\t';
        case 'r':  return '\r';
        case '0':  return '\0';
        case '\\': return '\\';
        case '\'': return '\'';
        case '\"': return '\"';
        default:   return c;
    }
}

/* Scan a quoted string lexeme for unsupported escape sequences. */
static int string_has_invalid_escape(const char *text) {
    const char *p = text;
    if (*p == '\"') {
        p++;
    }
    while (*p && *p != '\"') {
        if (*p == '\\') {
            p++;
            if (*p == '\0') {
                return 1;
            }
            if (!is_supported_escape(*p)) {
                return 1;
            }
        }
        p++;
    }
    return 0;
}
%}

%option noyywrap
%option nounput
%option noinput
%option yylineno

/* Exclusive start condition for multiline block comments */
%x COMMENT

%%

    /* --------------------------------------------------------------------------
     * 1. Comments & Whitespace
     * -------------------------------------------------------------------------- */

"//"[^\n]*              { /* Single-line comment: discard until end of line */ }

"/*"                    { comment_start_line = yylineno; BEGIN(COMMENT); }
<COMMENT>"*/"           { BEGIN(INITIAL); }
<COMMENT>\n             { /* yylineno incremented automatically by Flex */ }
<COMMENT>.              { /* Discard comment characters */ }
<COMMENT><<EOF>>        {
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Unterminated block comment\n", comment_start_line);
                            fflush(stderr);
                            cpp_lexical_error_count++;
                            BEGIN(INITIAL);
                            return 0;
                        }

[ \t\r]+                { /* Discard spaces, tabs, and carriage returns */ }
\n                      { /* Newlines handled by %option yylineno */ }

    /* --------------------------------------------------------------------------
     * 2. Preprocessing Directives (Unsupported language feature policy)
     * Only physical line-start directives (optional leading spaces/tabs).
     * Mid-line '#' falls through to the unrecognized-character rule.
     * -------------------------------------------------------------------------- */

^[ \t]*#[^\n]*          {
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Unsupported language feature: Preprocessing directive\n", yylineno);
                            fflush(stderr);
                            cpp_lexical_error_count++;
                        }

    /* --------------------------------------------------------------------------
     * 3. Keywords (ISO C++98/C++11 Object-Oriented Subset)
     * Ordered before IDENTIFIER to leverage Flex's longest-match and rule priority.
     * Note: std, cout, cin, endl, and main are identifiers, NOT keywords.
     * -------------------------------------------------------------------------- */

"int"                   { return KW_INT; }
"float"                 { return KW_FLOAT; }
"double"                { return KW_DOUBLE; }
"char"                  { return KW_CHAR; }
"void"                  { return KW_VOID; }
"bool"                  { return KW_BOOL; }
"true"                  { yylval.bval = 1; return KW_TRUE; }
"false"                 { yylval.bval = 0; return KW_FALSE; }

"if"                    { return KW_IF; }
"else"                  { return KW_ELSE; }
"while"                 { return KW_WHILE; }
"for"                   { return KW_FOR; }
"return"                { return KW_RETURN; }
"break"                 { return KW_BREAK; }
"continue"              { return KW_CONTINUE; }

"class"                 { return KW_CLASS; }
"public"                { return KW_PUBLIC; }
"private"               { return KW_PRIVATE; }
"protected"             { return KW_PROTECTED; }
"new"                   { return KW_NEW; }
"delete"                { return KW_DELETE; }
"this"                  { return KW_THIS; }

    /* --------------------------------------------------------------------------
     * 4. Multi-character Operators & Scope Resolution
     * Ordered before single-character operators
     * -------------------------------------------------------------------------- */

"::"                    { return SCOPE; }
"->"                    { return ARROW; }
"<<"                    { return LSHIFT; }
">>"                    { return RSHIFT; }

"=="                    { return EQ; }
"!="                    { return NE; }
"<="                    { return LE; }
">="                    { return GE; }
"&&"                    { return AND; }
"||"                    { return OR; }
"++"                    { return INC; }
"--"                    { return DEC; }
"+="                    { return PLUS_ASSIGN; }
"-="                    { return MINUS_ASSIGN; }
"*="                    { return STAR_ASSIGN; }
"/="                    { return SLASH_ASSIGN; }
"%="                    { return MOD_ASSIGN; }

    /* --------------------------------------------------------------------------
     * 5. Single-character Operators
     * -------------------------------------------------------------------------- */

"."                     { return DOT; }
"+"                     { return PLUS; }
"-"                     { return MINUS; }
"*"                     { return STAR; }
"/"                     { return SLASH; }
"%"                     { return MOD; }
"<"                     { return LT; }
">"                     { return GT; }
"!"                     { return NOT; }
"="                     { return ASSIGN; }

    /* --------------------------------------------------------------------------
     * 6. Delimiters & Punctuation
     * -------------------------------------------------------------------------- */

"{"                     { return LBRACE; }
"}"                     { return RBRACE; }
"("                     { return LPAREN; }
")"                     { return RPAREN; }
"["                     { return LBRACKET; }
"]"                     { return RBRACKET; }
";"                     { return SEMICOLON; }
","                     { return COMMA; }
":"                     { return COLON; }

    /* --------------------------------------------------------------------------
     * 7. Character Literals
     * -------------------------------------------------------------------------- */

"''"                    {
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Empty character literal\n", yylineno);
                            fflush(stderr);
                            cpp_lexical_error_count++;
                        }

'([^'\\\n]|\\.)'        {
                            if (yytext[1] == '\\') {
                                if (!is_supported_escape(yytext[2])) {
                                    fflush(stdout);
                                    fprintf(stderr, "Lexical Error at line %d: Invalid escape sequence\n", yylineno);
                                    fflush(stderr);
                                    cpp_lexical_error_count++;
                                } else {
                                    yylval.cval = parse_escape_char(yytext[2]);
                                    return CHAR_LITERAL;
                                }
                            } else {
                                yylval.cval = yytext[1];
                                return CHAR_LITERAL;
                            }
                        }

'([^'\\\n]|\\.)+'       {
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Multi-character literal is unsupported\n", yylineno);
                            fflush(stderr);
                            cpp_lexical_error_count++;
                        }

'([^'\\\n]|\\.)*        {
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Unterminated character literal\n", yylineno);
                            fflush(stderr);
                            cpp_lexical_error_count++;
                        }

    /* --------------------------------------------------------------------------
     * 8. String Literals
     * -------------------------------------------------------------------------- */

\"([^\"\\\n]|\\.)*\"    {
                            if (string_has_invalid_escape(yytext)) {
                                fflush(stdout);
                                fprintf(stderr, "Lexical Error at line %d: Invalid escape sequence\n", yylineno);
                                fflush(stderr);
                                cpp_lexical_error_count++;
                            } else {
                                yylval.sval = strdup(yytext);
                                return STRING_LITERAL;
                            }
                        }

\"([^\"\\\n]|\\.)*      {
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Unterminated string literal\n", yylineno);
                            fflush(stderr);
                            cpp_lexical_error_count++;
                        }

    /* --------------------------------------------------------------------------
     * 9. Numeric Literals
     * Unsigned numbers only; minus sign is tokenized separately as MINUS.
     * -------------------------------------------------------------------------- */

[0-9]+\.[0-9]+          {
                            yylval.fval = atof(yytext);
                            return FLOAT_LITERAL;
                        }

[0-9]+                  {
                            yylval.ival = atoi(yytext);
                            return INT_LITERAL;
                        }

    /* --------------------------------------------------------------------------
     * 10. Identifiers
     * Standard alphanumeric/underscore names; includes main, std, cout, cin, endl.
     * -------------------------------------------------------------------------- */

[a-zA-Z_][a-zA-Z0-9_]*  {
                            yylval.sval = strdup(yytext);
                            return IDENTIFIER;
                        }

    /* --------------------------------------------------------------------------
     * 11. Fallback Rule: Lexical Errors
     * Matches any unexpected character.
     * -------------------------------------------------------------------------- */

.                       {
                            fflush(stdout);
                            fprintf(stderr, "Lexical Error at line %d: Unrecognized character '%c'\n",
                                    yylineno, yytext[0]);
                            fflush(stderr);
                            cpp_lexical_error_count++;
                        }

%%

