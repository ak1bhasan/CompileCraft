#ifndef COMPILECRAFT_PARSER_H
#define COMPILECRAFT_PARSER_H

/* ==============================================================================
 * CompileCraft - Parser External Interface
 * Milestone 3.3: Syntax Analyzer Driver Declarations
 * Milestone 4.3.1: AST root ownership handoff
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

struct AstNode;

/*
 * Production AST root (M4.3.1).
 * Successful program reduction transfers AST_PROGRAM here; start-symbol $$ is
 * left NULL. Caller must clear to NULL before yyparse, then ast_free exactly
 * once afterward (and set back to NULL).
 */
extern struct AstNode *compilecraft_ast_root;

/*
 * Test-only expression capture (production leaves enable at 0).
 * First expr_stmt transfers its expression into compilecraft_expr_capture
 * (no ExprStmt wrapper / shared ownership). Caller must ast_free it.
 */
extern int compilecraft_capture_expr_enable;
extern struct AstNode *compilecraft_expr_capture;

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_PARSER_H */
