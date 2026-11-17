#ifndef COMPILECRAFT_PARSER_H
#define COMPILECRAFT_PARSER_H

/* ==============================================================================
 * CompileCraft - Parser External Interface
 * Milestone 3.3: Syntax Analyzer Driver Declarations
 * ============================================================================== */

#ifdef __cplusplus
extern "C" {
#endif

extern int syntax_error_count;
extern int lexical_error_count;

void yyerror(const char *msg);
int yyparse(void);

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_PARSER_H */
