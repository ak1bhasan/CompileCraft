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
 * Test-only AST capture hooks (production CLI leaves enables at 0).
 * Expression: first expr_stmt transfers its expression into
 *   compilecraft_expr_capture (no ExprStmt wrapper / shared ownership).
 * Program: successful program reduction transfers AST_PROGRAM into
 *   compilecraft_program_capture instead of freeing it.
 * Caller must ast_free the captured tree.
 */
struct AstNode;
extern int compilecraft_capture_expr_enable;
extern struct AstNode *compilecraft_expr_capture;
extern int compilecraft_capture_program_enable;
extern struct AstNode *compilecraft_program_capture;

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_PARSER_H */
