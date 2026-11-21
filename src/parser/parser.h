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

/* Reset lexer source-location cursor (M4.2.3); no-op in standalone lexer builds. */
void compilecraft_loc_reset(void);

/*
 * M4.2.5 expression-AST test hook (production CLI leaves enable at 0).
 * When enable is non-zero, the first expr_stmt transfers its expression
 * ownership into compilecraft_expr_capture. Caller must ast_free it.
 */
struct AstNode;
extern int compilecraft_capture_expr_enable;
extern struct AstNode *compilecraft_expr_capture;

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_PARSER_H */
