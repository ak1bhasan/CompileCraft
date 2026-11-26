#ifndef COMPILECRAFT_CPP_PARSER_H
#define COMPILECRAFT_CPP_PARSER_H

/* ==============================================================================
 * CompileCraft - C++ Front-End Parser Interface (M10)
 * ============================================================================== */

#ifdef __cplusplus
extern "C" {
#endif

extern int syntax_error_count;
extern int cpp_lexical_error_count;

void yyerror(const char *msg);
int yyparse(void);

/* Reset lexer source-location cursor; no-op in standalone lexer builds. */
void compilecraft_cpp_loc_reset(void);

struct AstNode;

/*
 * Successful program reduction transfers AST_PROGRAM here; start-symbol $$ is
 * left NULL. Caller must clear to NULL before yyparse, then ast_free exactly
 * once afterward.
 */
extern struct AstNode *compilecraft_cpp_ast_root;

#ifdef __cplusplus
}
#endif

#endif /* COMPILECRAFT_CPP_PARSER_H */
