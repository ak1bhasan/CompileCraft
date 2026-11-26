MSYS2_ROOT ?= E:/msys64

# Force 64-bit MSYS2 shell to avoid legacy 32-bit E:/mingw32/msys/1.0/bin/sh.exe
SHELL := $(MSYS2_ROOT)/usr/bin/sh.exe

ifeq ($(origin CC),default)
CC := $(MSYS2_ROOT)/ucrt64/bin/gcc.exe
endif
CC ?= $(MSYS2_ROOT)/ucrt64/bin/gcc.exe

FLEX   ?= $(MSYS2_ROOT)/usr/bin/flex.exe
BISON  ?= $(MSYS2_ROOT)/usr/bin/bison.exe
PYTHON ?= python

CFLAGS ?= -Wall -Wextra -pedantic -std=c11
TARGET ?= compilecraft.exe

BIN_DIR         ?= bin
BUILD_DIR       ?= build
BUILD_C_DIR     ?= $(BUILD_DIR)/c
BUILD_CPP_DIR   ?= $(BUILD_DIR)/cpp
BUILD_JAVA_DIR  ?= $(BUILD_DIR)/java
BUILD_PARSER_DIR ?= $(BUILD_DIR)/parser

LEXER_BIN       ?= $(BIN_DIR)/compilecraft-lexer.exe
LEXER_C_BIN     ?= $(BIN_DIR)/compilecraft-lexer-c.exe
LEXER_CPP_BIN   ?= $(BIN_DIR)/compilecraft-lexer-cpp.exe
LEXER_JAVA_BIN  ?= $(BIN_DIR)/compilecraft-lexer-java.exe
PARSER_BIN      ?= $(BIN_DIR)/compilecraft-parser.exe
# M4.2.5/M4.2.6: test-only AST printers (not part of the public CLI).
EXPR_AST_BIN    ?= $(BIN_DIR)/compilecraft-expr-ast.exe
PROGRAM_AST_BIN ?= $(BIN_DIR)/compilecraft-program-ast.exe
# M4.2.7: AST list ownership unit test (links AST core only).
AST_OWNERSHIP_BIN ?= $(BIN_DIR)/test-ast-list-ownership.exe
# M5/M6: Symbol Table and Semantic Analyzer
SYMTAB_BIN      ?= $(BIN_DIR)/test-symbol-table.exe
SEMANTIC_BIN    ?= $(BIN_DIR)/compilecraft-semantic.exe
# M7: Three-Address Code Generator
TEST_TAC_BIN    ?= $(BIN_DIR)/test-tac.exe
TAC_BIN         ?= $(BIN_DIR)/compilecraft-tac.exe
# M9: C front-end (lexer + parser + semantic + TAC)
C_COMPILER_BIN  ?= $(BIN_DIR)/compilecraft-c.exe
# M10: C++ front-end (lexer + parser + semantic + TAC)
CPP_COMPILER_BIN ?= $(BIN_DIR)/compilecraft-cpp.exe
# M11: Java front-end (lexer + parser + semantic + TAC)
JAVA_COMPILER_BIN ?= $(BIN_DIR)/compilecraft-java.exe

BUILD_SYMTAB_DIR ?= $(BUILD_DIR)/symbol_table
BUILD_SEMANTIC_DIR ?= $(BUILD_DIR)/semantic
BUILD_TAC_DIR   ?= $(BUILD_DIR)/tac
BUILD_C_PARSER_DIR ?= $(BUILD_DIR)/c_parser
BUILD_CPP_PARSER_DIR ?= $(BUILD_DIR)/cpp_parser
BUILD_JAVA_PARSER_DIR ?= $(BUILD_DIR)/java_parser

PARSER_TAB_C    := $(BUILD_PARSER_DIR)/parser.tab.c
PARSER_TAB_H    := $(BUILD_PARSER_DIR)/parser.tab.h
# Parser-linked Flex object (distinct from standalone build/lex.yy.o).
PARSER_LEX_O    := $(BUILD_PARSER_DIR)/lex.yy.o
# AST core object (M4.1); linked into the parser binary only (M4.2.2).
AST_O           := $(BUILD_DIR)/ast/ast.o
SYMTAB_O        := $(BUILD_SYMTAB_DIR)/symbol_table.o
SEMANTIC_O      := $(BUILD_SEMANTIC_DIR)/semantic.o
TAC_O           := $(BUILD_TAC_DIR)/tac.o
# -d: header, -v: parser.output
# Fail the build on unresolved shift/reduce or reduce/reduce conflicts.
# Do not use %expect — conflicts must fail the build, not be hidden.
BISONFLAGS      ?= -d -v -Werror=conflicts-sr -Werror=conflicts-rr

.PHONY: all toolchain-check lexer lexer-c lexer-cpp lexer-java parser c-compiler cpp-compiler java-compiler test-lexer test-c test-cpp test-java test-parser test-expr-ast test-program-ast test-ast test-ast-ownership test-symtab test-semantic test-tac test-tac-unit test-tac-golden test-c-parser test-c-semantic test-c-tac test-c-compiler test-cpp-parser test-cpp-semantic test-cpp-tac test-cpp-compiler test-java-parser test-java-semantic test-java-tac test-java-compiler test clean help

all: toolchain-check $(LEXER_BIN) $(LEXER_C_BIN) $(LEXER_CPP_BIN) $(LEXER_JAVA_BIN) $(PARSER_BIN) $(EXPR_AST_BIN) $(PROGRAM_AST_BIN) $(AST_OWNERSHIP_BIN) $(SYMTAB_BIN) $(SEMANTIC_BIN) $(TEST_TAC_BIN) $(TAC_BIN) $(C_COMPILER_BIN) $(CPP_COMPILER_BIN) $(JAVA_COMPILER_BIN)
	@echo ""
	@echo "=============================================================================="
	@echo " CompileCraft - Build Succeeded (through Milestone 11: Java Parser)"
	@echo "=============================================================================="
	@echo " Verified Toolchain:"
	@echo "   CC            : $(CC)"
	@echo "   FLEX          : $(FLEX)"
	@echo "   BISON         : $(BISON)"
	@echo "   PYTHON        : $(PYTHON)"
	@echo ""
	@echo " Built Artifacts:"
	@echo "   Baseline Lexer: $(LEXER_BIN)"
	@echo "   C Lexer       : $(LEXER_C_BIN)"
	@echo "   C++ Lexer     : $(LEXER_CPP_BIN)"
	@echo "   Java Lexer    : $(LEXER_JAVA_BIN)"
	@echo "   Parser        : $(PARSER_BIN)"
	@echo "   C Compiler    : $(C_COMPILER_BIN)"
	@echo "   C++ Compiler  : $(CPP_COMPILER_BIN)"
	@echo "   Java Compiler : $(JAVA_COMPILER_BIN)"
	@echo "   Expr AST test : $(EXPR_AST_BIN)"
	@echo "   Program AST   : $(PROGRAM_AST_BIN)"
	@echo "   AST ownership : $(AST_OWNERSHIP_BIN)"
	@echo ""
	@echo " Run 'mingw32-make test' to execute all regression test suites."
	@echo "=============================================================================="

toolchain-check:
	@echo "Checking toolchain executables..."
	@$(CC) --version | head -n 1
	@$(FLEX) --version
	@$(BISON) --version | head -n 1
	@$(PYTHON) --version

# ------------------------------------------------------------------------------
# Baseline Mini-Language Lexer (Milestone 2.0 reference)
# ------------------------------------------------------------------------------
$(BUILD_DIR)/lex.yy.c: src/lexer/lexer.l src/lexer/tokens.h src/lexer/tokens.def
	@mkdir -p $(BUILD_DIR)
	$(FLEX) -o $(BUILD_DIR)/lex.yy.c src/lexer/lexer.l

$(BUILD_DIR)/lex.yy.o: $(BUILD_DIR)/lex.yy.c src/lexer/tokens.h src/lexer/tokens.def
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc -c $(BUILD_DIR)/lex.yy.c -o $@

$(LEXER_BIN): $(BUILD_DIR)/lex.yy.c src/lexer/tokens.c src/lexer/tokens.h src/lexer/tokens.def src/lexer/main.c
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc -o $(LEXER_BIN) $(BUILD_DIR)/lex.yy.c src/lexer/tokens.c src/lexer/main.c

lexer: $(LEXER_BIN)

test-lexer: $(LEXER_BIN)
	$(PYTHON) tests/run_tests.py $(LEXER_BIN) tests/lexer

# ------------------------------------------------------------------------------
# C-Subset Lexer (Milestone 2.1)
# ------------------------------------------------------------------------------
$(BUILD_C_DIR)/lex.yy.c: C_Compiler/lexer.l C_Compiler/tokens.h C_Compiler/tokens.def
	@mkdir -p $(BUILD_C_DIR)
	$(FLEX) -o $(BUILD_C_DIR)/lex.yy.c C_Compiler/lexer.l

$(LEXER_C_BIN): $(BUILD_C_DIR)/lex.yy.c C_Compiler/tokens.c C_Compiler/tokens.h C_Compiler/tokens.def C_Compiler/main_c.c
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -IC_Compiler -Isrc -o $(LEXER_C_BIN) $(BUILD_C_DIR)/lex.yy.c C_Compiler/tokens.c C_Compiler/main_c.c

lexer-c: $(LEXER_C_BIN)

test-c: $(LEXER_C_BIN)
	$(PYTHON) tests/run_tests.py $(LEXER_C_BIN) tests/c

# ------------------------------------------------------------------------------
# C++-Subset Lexer (Milestone 2.2)
# ------------------------------------------------------------------------------
$(BUILD_CPP_DIR)/lex.yy.c: CPP_Compiler/lexer.l CPP_Compiler/tokens.h CPP_Compiler/tokens.def
	@mkdir -p $(BUILD_CPP_DIR)
	$(FLEX) -o $(BUILD_CPP_DIR)/lex.yy.c CPP_Compiler/lexer.l

$(LEXER_CPP_BIN): $(BUILD_CPP_DIR)/lex.yy.c CPP_Compiler/tokens.c CPP_Compiler/tokens.h CPP_Compiler/tokens.def CPP_Compiler/main_cpp.c
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -ICPP_Compiler -Isrc -o $(LEXER_CPP_BIN) $(BUILD_CPP_DIR)/lex.yy.c CPP_Compiler/tokens.c CPP_Compiler/main_cpp.c

lexer-cpp: $(LEXER_CPP_BIN)

test-cpp: $(LEXER_CPP_BIN)
	$(PYTHON) tests/run_tests.py $(LEXER_CPP_BIN) tests/cpp

# ------------------------------------------------------------------------------
# Java-Subset Lexer (Milestone 2.3)
# ------------------------------------------------------------------------------
$(BUILD_JAVA_DIR)/lex.yy.c: Java_Compiler/lexer.l Java_Compiler/tokens.h Java_Compiler/tokens.def
	@mkdir -p $(BUILD_JAVA_DIR)
	$(FLEX) -o $(BUILD_JAVA_DIR)/lex.yy.c Java_Compiler/lexer.l

$(LEXER_JAVA_BIN): $(BUILD_JAVA_DIR)/lex.yy.c Java_Compiler/tokens.c Java_Compiler/tokens.h Java_Compiler/tokens.def Java_Compiler/main_java.c
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -IJava_Compiler -Isrc -o $(LEXER_JAVA_BIN) $(BUILD_JAVA_DIR)/lex.yy.c Java_Compiler/tokens.c Java_Compiler/main_java.c

lexer-java: $(LEXER_JAVA_BIN)

test-java: $(LEXER_JAVA_BIN)
	$(PYTHON) tests/run_tests.py $(LEXER_JAVA_BIN) tests/java

# ------------------------------------------------------------------------------
# AST core (Milestone 4.1 sources; build integration Milestone 4.2.2)
# Linked into the parser only — not the standalone lexer.
# ------------------------------------------------------------------------------
$(AST_O): src/ast/ast.c src/ast/ast.h
	@mkdir -p $(BUILD_DIR)/ast
	$(CC) $(CFLAGS) -Isrc/ast -Isrc -c src/ast/ast.c -o $@

# ------------------------------------------------------------------------------
# Baseline Mini-Language Parser (Milestone 3.3 + M4.2.2 AST build link)
# ------------------------------------------------------------------------------
$(BUILD_PARSER_DIR)/%.tab.c $(BUILD_PARSER_DIR)/%.tab.h: src/parser/%.y
	@mkdir -p $(BUILD_PARSER_DIR)
	$(BISON) $(BISONFLAGS) -o $(BUILD_PARSER_DIR)/$*.tab.c $<

$(BUILD_PARSER_DIR)/parser.tab.o: $(PARSER_TAB_C) $(PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc/parser -Isrc/ast -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

# Parser-specific lexer object: reuse Flex output from build/lex.yy.c, but
# force-include Bison's parser.tab.h before tokens.h (via -include) so the
# parser binary and lexer share one YYSTYPE / YYLTYPE layout (M4.2.2+).
# That inclusion defines YYLTYPE_IS_DECLARED, enabling YY_USER_ACTION location
# tracking in lexer.l. parser.tab.h also pulls ast.h for extended %union.
# Standalone compilecraft-lexer.exe omits parser.tab.h.
$(PARSER_LEX_O): $(BUILD_DIR)/lex.yy.c src/lexer/tokens.h src/lexer/tokens.def $(PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc/ast -I$(BUILD_PARSER_DIR) -Isrc \
		-include parser.tab.h \
		-c $(BUILD_DIR)/lex.yy.c -o $@

$(BUILD_PARSER_DIR)/tokens.o: src/lexer/tokens.c src/lexer/tokens.h src/lexer/tokens.def $(PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -DBISON_OWNS_YYLVAL -Isrc/lexer -Isrc/ast -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

$(BUILD_PARSER_DIR)/main.o: src/parser/main.c src/parser/parser.h $(PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc/parser -Isrc/ast -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

$(PARSER_BIN): $(BUILD_PARSER_DIR)/parser.tab.o $(PARSER_LEX_O) $(BUILD_PARSER_DIR)/tokens.o $(BUILD_PARSER_DIR)/main.o $(AST_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

# Expression AST structural harness (M4.2.5): same parser objects, different main.
$(BUILD_PARSER_DIR)/expr_ast_harness.o: tests/expr_ast/support/harness.c src/parser/parser.h $(PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc/parser -Isrc/ast -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

$(EXPR_AST_BIN): $(BUILD_PARSER_DIR)/parser.tab.o $(PARSER_LEX_O) $(BUILD_PARSER_DIR)/tokens.o $(BUILD_PARSER_DIR)/expr_ast_harness.o $(AST_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

# Program AST structural harness (M4.2.6): same parser objects, different main.
$(BUILD_PARSER_DIR)/program_ast_harness.o: tests/program_ast/support/harness.c src/parser/parser.h $(PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc/parser -Isrc/ast -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

$(PROGRAM_AST_BIN): $(BUILD_PARSER_DIR)/parser.tab.o $(PARSER_LEX_O) $(BUILD_PARSER_DIR)/tokens.o $(BUILD_PARSER_DIR)/program_ast_harness.o $(AST_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

parser: $(PARSER_BIN)

test-parser: $(PARSER_BIN)
	$(PYTHON) tests/run_tests.py $(PARSER_BIN) tests/parser

test-expr-ast: $(EXPR_AST_BIN)
	$(PYTHON) tests/run_tests.py $(EXPR_AST_BIN) tests/expr_ast

test-program-ast: $(PROGRAM_AST_BIN)
	$(PYTHON) tests/run_tests.py $(PROGRAM_AST_BIN) tests/program_ast

# M4.4: production --ast golden suite (compilecraft-parser.exe --ast).
test-ast: $(PARSER_BIN)
	$(PYTHON) tests/run_tests.py $(PARSER_BIN) tests/ast

# M4.2.7: cross-list ownership unit test (AST core only; no parser/Flex).
$(BUILD_DIR)/ast_ownership/test_list_ownership.o: tests/ast_ownership/test_list_ownership.c src/ast/ast.h
	@mkdir -p $(BUILD_DIR)/ast_ownership
	$(CC) $(CFLAGS) -Isrc/ast -Isrc -c $< -o $@

$(AST_OWNERSHIP_BIN): $(BUILD_DIR)/ast_ownership/test_list_ownership.o $(AST_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

test-ast-ownership: $(AST_OWNERSHIP_BIN)
	$(AST_OWNERSHIP_BIN)

# ------------------------------------------------------------------------------
# Milestone 5: Scoped Symbol Table
# ------------------------------------------------------------------------------
$(BUILD_SYMTAB_DIR)/symbol_table.o: src/symbol_table/symbol_table.c src/symbol_table/symbol_table.h
	@mkdir -p $(BUILD_SYMTAB_DIR)
	$(CC) $(CFLAGS) -Isrc/symbol_table -Isrc -c $< -o $@

$(BUILD_SYMTAB_DIR)/test_symbol_table.o: tests/symbol_table/test_symbol_table.c src/symbol_table/symbol_table.h
	@mkdir -p $(BUILD_SYMTAB_DIR)
	$(CC) $(CFLAGS) -Isrc/symbol_table -Isrc -c $< -o $@

$(SYMTAB_BIN): $(BUILD_SYMTAB_DIR)/test_symbol_table.o $(SYMTAB_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

test-symtab: $(SYMTAB_BIN)
	$(SYMTAB_BIN)

# ------------------------------------------------------------------------------
# Milestone 6: Semantic Analyzer
# ------------------------------------------------------------------------------
$(BUILD_SEMANTIC_DIR)/semantic.o: src/semantic/semantic.c src/semantic/semantic.h src/ast/ast.h src/symbol_table/symbol_table.h
	@mkdir -p $(BUILD_SEMANTIC_DIR)
	$(CC) $(CFLAGS) -Isrc/semantic -Isrc/ast -Isrc/symbol_table -Isrc -c $< -o $@

$(BUILD_SEMANTIC_DIR)/main.o: src/semantic/main.c src/semantic/semantic.h src/ast/ast.h src/symbol_table/symbol_table.h src/parser/parser.h $(PARSER_TAB_H)
	@mkdir -p $(BUILD_SEMANTIC_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc/parser -Isrc/ast -Isrc/symbol_table -Isrc/semantic -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

$(SEMANTIC_BIN): $(BUILD_PARSER_DIR)/parser.tab.o $(PARSER_LEX_O) $(BUILD_PARSER_DIR)/tokens.o $(BUILD_SEMANTIC_DIR)/main.o $(AST_O) $(SYMTAB_O) $(SEMANTIC_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

test-semantic: $(SEMANTIC_BIN)
	$(PYTHON) tests/run_tests.py $(SEMANTIC_BIN) tests/semantic

# ------------------------------------------------------------------------------
# Milestone 7: Three-Address Code (TAC) Generator
# ------------------------------------------------------------------------------
$(BUILD_TAC_DIR)/tac.o: src/tac/tac.c src/tac/tac.h src/ast/ast.h
	@mkdir -p $(BUILD_TAC_DIR)
	$(CC) $(CFLAGS) -Isrc/tac -Isrc/ast -Isrc -c $< -o $@

$(BUILD_TAC_DIR)/test_tac.o: tests/tac/test_tac.c src/tac/tac.h src/ast/ast.h
	@mkdir -p $(BUILD_TAC_DIR)
	$(CC) $(CFLAGS) -Isrc/tac -Isrc/ast -Isrc -c $< -o $@

$(TEST_TAC_BIN): $(BUILD_TAC_DIR)/test_tac.o $(TAC_O) $(AST_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

$(BUILD_TAC_DIR)/main.o: src/tac/main.c src/tac/tac.h src/semantic/semantic.h src/ast/ast.h src/symbol_table/symbol_table.h src/parser/parser.h $(PARSER_TAB_H)
	@mkdir -p $(BUILD_TAC_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc/parser -Isrc/ast -Isrc/symbol_table -Isrc/semantic -Isrc/tac -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

$(TAC_BIN): $(BUILD_PARSER_DIR)/parser.tab.o $(PARSER_LEX_O) $(BUILD_PARSER_DIR)/tokens.o $(BUILD_TAC_DIR)/main.o $(AST_O) $(SYMTAB_O) $(SEMANTIC_O) $(TAC_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

test-tac-unit: $(TEST_TAC_BIN)
	$(TEST_TAC_BIN)

test-tac-golden: $(TAC_BIN)
	$(PYTHON) tests/run_tests.py $(TAC_BIN) tests/tac/golden

test-tac: test-tac-unit test-tac-golden

# ------------------------------------------------------------------------------
# Milestone 9: C Front-End (parser + semantic + TAC)
# ------------------------------------------------------------------------------
C_PARSER_TAB_C := $(BUILD_C_PARSER_DIR)/c_parser.tab.c
C_PARSER_TAB_H := $(BUILD_C_PARSER_DIR)/c_parser.tab.h
C_PARSER_LEX_O := $(BUILD_C_PARSER_DIR)/lex.yy.o

$(BUILD_C_PARSER_DIR)/c_parser.tab.c $(BUILD_C_PARSER_DIR)/c_parser.tab.h: C_Compiler/parser.y
	@mkdir -p $(BUILD_C_PARSER_DIR)
	$(BISON) $(BISONFLAGS) -o $(BUILD_C_PARSER_DIR)/c_parser.tab.c $<

$(BUILD_C_PARSER_DIR)/c_parser.tab.o: $(C_PARSER_TAB_C) $(C_PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_C_PARSER_DIR)
	$(CC) $(CFLAGS) -IC_Compiler -Isrc/ast -I$(BUILD_C_PARSER_DIR) -Isrc -c $< -o $@

# Parser-linked C lexer: force-include Bison header for shared YYSTYPE/YYLTYPE.
$(C_PARSER_LEX_O): $(BUILD_C_DIR)/lex.yy.c C_Compiler/tokens.h C_Compiler/tokens.def $(C_PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_C_PARSER_DIR)
	$(CC) $(CFLAGS) -IC_Compiler -Isrc/ast -I$(BUILD_C_PARSER_DIR) -Isrc \
		-include c_parser.tab.h \
		-c $(BUILD_C_DIR)/lex.yy.c -o $@

$(BUILD_C_PARSER_DIR)/tokens.o: C_Compiler/tokens.c C_Compiler/tokens.h C_Compiler/tokens.def $(C_PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_C_PARSER_DIR)
	$(CC) $(CFLAGS) -DBISON_OWNS_YYLVAL -IC_Compiler -Isrc/ast -I$(BUILD_C_PARSER_DIR) -Isrc -c $< -o $@

$(BUILD_C_PARSER_DIR)/main_compiler.o: C_Compiler/main_compiler.c C_Compiler/parser.h $(C_PARSER_TAB_H) src/ast/ast.h src/semantic/semantic.h src/tac/tac.h
	@mkdir -p $(BUILD_C_PARSER_DIR)
	$(CC) $(CFLAGS) -IC_Compiler -Isrc/ast -Isrc/symbol_table -Isrc/semantic -Isrc/tac -I$(BUILD_C_PARSER_DIR) -Isrc -c $< -o $@

$(C_COMPILER_BIN): $(BUILD_C_PARSER_DIR)/c_parser.tab.o $(C_PARSER_LEX_O) $(BUILD_C_PARSER_DIR)/tokens.o $(BUILD_C_PARSER_DIR)/main_compiler.o $(AST_O) $(SYMTAB_O) $(SEMANTIC_O) $(TAC_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

c-compiler: $(C_COMPILER_BIN)

test-c-parser: $(C_COMPILER_BIN)
	$(PYTHON) tests/run_tests.py $(C_COMPILER_BIN) tests/c/parser

test-c-semantic: $(C_COMPILER_BIN)
	$(PYTHON) tests/run_tests.py $(C_COMPILER_BIN) tests/c/semantic

test-c-tac: $(C_COMPILER_BIN)
	$(PYTHON) tests/run_tests.py $(C_COMPILER_BIN) tests/c/tac

test-c-compiler: test-c-parser test-c-semantic test-c-tac

# ------------------------------------------------------------------------------
# Milestone 10: C++ Front-End (parser + semantic + TAC)
# ------------------------------------------------------------------------------
CPP_PARSER_TAB_C := $(BUILD_CPP_PARSER_DIR)/cpp_parser.tab.c
CPP_PARSER_TAB_H := $(BUILD_CPP_PARSER_DIR)/cpp_parser.tab.h
CPP_PARSER_LEX_O := $(BUILD_CPP_PARSER_DIR)/lex.yy.o

$(BUILD_CPP_PARSER_DIR)/cpp_parser.tab.c $(BUILD_CPP_PARSER_DIR)/cpp_parser.tab.h: CPP_Compiler/parser.y
	@mkdir -p $(BUILD_CPP_PARSER_DIR)
	$(BISON) $(BISONFLAGS) -o $(BUILD_CPP_PARSER_DIR)/cpp_parser.tab.c $<

$(BUILD_CPP_PARSER_DIR)/cpp_parser.tab.o: $(CPP_PARSER_TAB_C) $(CPP_PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_CPP_PARSER_DIR)
	$(CC) $(CFLAGS) -ICPP_Compiler -Isrc/ast -I$(BUILD_CPP_PARSER_DIR) -Isrc -c $< -o $@

$(CPP_PARSER_LEX_O): $(BUILD_CPP_DIR)/lex.yy.c CPP_Compiler/tokens.h CPP_Compiler/tokens.def $(CPP_PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_CPP_PARSER_DIR)
	$(CC) $(CFLAGS) -ICPP_Compiler -Isrc/ast -I$(BUILD_CPP_PARSER_DIR) -Isrc \
		-include cpp_parser.tab.h \
		-c $(BUILD_CPP_DIR)/lex.yy.c -o $@

$(BUILD_CPP_PARSER_DIR)/tokens.o: CPP_Compiler/tokens.c CPP_Compiler/tokens.h CPP_Compiler/tokens.def $(CPP_PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_CPP_PARSER_DIR)
	$(CC) $(CFLAGS) -DBISON_OWNS_YYLVAL -ICPP_Compiler -Isrc/ast -I$(BUILD_CPP_PARSER_DIR) -Isrc -c $< -o $@

$(BUILD_CPP_PARSER_DIR)/main_compiler.o: CPP_Compiler/main_compiler.c CPP_Compiler/parser.h $(CPP_PARSER_TAB_H) src/ast/ast.h src/semantic/semantic.h src/tac/tac.h
	@mkdir -p $(BUILD_CPP_PARSER_DIR)
	$(CC) $(CFLAGS) -ICPP_Compiler -Isrc/ast -Isrc/symbol_table -Isrc/semantic -Isrc/tac -I$(BUILD_CPP_PARSER_DIR) -Isrc -c $< -o $@

$(CPP_COMPILER_BIN): $(BUILD_CPP_PARSER_DIR)/cpp_parser.tab.o $(CPP_PARSER_LEX_O) $(BUILD_CPP_PARSER_DIR)/tokens.o $(BUILD_CPP_PARSER_DIR)/main_compiler.o $(AST_O) $(SYMTAB_O) $(SEMANTIC_O) $(TAC_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

cpp-compiler: $(CPP_COMPILER_BIN)

test-cpp-parser: $(CPP_COMPILER_BIN)
	$(PYTHON) tests/run_tests.py $(CPP_COMPILER_BIN) tests/cpp/parser

test-cpp-semantic: $(CPP_COMPILER_BIN)
	$(PYTHON) tests/run_tests.py $(CPP_COMPILER_BIN) tests/cpp/semantic

test-cpp-tac: $(CPP_COMPILER_BIN)
	$(PYTHON) tests/run_tests.py $(CPP_COMPILER_BIN) tests/cpp/tac

test-cpp-compiler: test-cpp-parser test-cpp-semantic test-cpp-tac

# ------------------------------------------------------------------------------
# Milestone 11: Java Front-End (parser + semantic + TAC)
# ------------------------------------------------------------------------------
JAVA_PARSER_TAB_C := $(BUILD_JAVA_PARSER_DIR)/java_parser.tab.c
JAVA_PARSER_TAB_H := $(BUILD_JAVA_PARSER_DIR)/java_parser.tab.h
JAVA_PARSER_LEX_O := $(BUILD_JAVA_PARSER_DIR)/lex.yy.o

$(BUILD_JAVA_PARSER_DIR)/java_parser.tab.c $(BUILD_JAVA_PARSER_DIR)/java_parser.tab.h: Java_Compiler/parser.y
	@mkdir -p $(BUILD_JAVA_PARSER_DIR)
	$(BISON) $(BISONFLAGS) -o $(BUILD_JAVA_PARSER_DIR)/java_parser.tab.c $<

$(BUILD_JAVA_PARSER_DIR)/java_parser.tab.o: $(JAVA_PARSER_TAB_C) $(JAVA_PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_JAVA_PARSER_DIR)
	$(CC) $(CFLAGS) -IJava_Compiler -Isrc/ast -I$(BUILD_JAVA_PARSER_DIR) -Isrc -c $< -o $@

$(JAVA_PARSER_LEX_O): $(BUILD_JAVA_DIR)/lex.yy.c Java_Compiler/tokens.h Java_Compiler/tokens.def $(JAVA_PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_JAVA_PARSER_DIR)
	$(CC) $(CFLAGS) -IJava_Compiler -Isrc/ast -I$(BUILD_JAVA_PARSER_DIR) -Isrc \
		-include java_parser.tab.h \
		-c $(BUILD_JAVA_DIR)/lex.yy.c -o $@

$(BUILD_JAVA_PARSER_DIR)/tokens.o: Java_Compiler/tokens.c Java_Compiler/tokens.h Java_Compiler/tokens.def $(JAVA_PARSER_TAB_H) src/ast/ast.h
	@mkdir -p $(BUILD_JAVA_PARSER_DIR)
	$(CC) $(CFLAGS) -DBISON_OWNS_YYLVAL -IJava_Compiler -Isrc/ast -I$(BUILD_JAVA_PARSER_DIR) -Isrc -c $< -o $@

$(BUILD_JAVA_PARSER_DIR)/main_compiler.o: Java_Compiler/main_compiler.c Java_Compiler/parser.h $(JAVA_PARSER_TAB_H) src/ast/ast.h src/semantic/semantic.h src/tac/tac.h
	@mkdir -p $(BUILD_JAVA_PARSER_DIR)
	$(CC) $(CFLAGS) -IJava_Compiler -Isrc/ast -Isrc/symbol_table -Isrc/semantic -Isrc/tac -I$(BUILD_JAVA_PARSER_DIR) -Isrc -c $< -o $@

$(JAVA_COMPILER_BIN): $(BUILD_JAVA_PARSER_DIR)/java_parser.tab.o $(JAVA_PARSER_LEX_O) $(BUILD_JAVA_PARSER_DIR)/tokens.o $(BUILD_JAVA_PARSER_DIR)/main_compiler.o $(AST_O) $(SYMTAB_O) $(SEMANTIC_O) $(TAC_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

java-compiler: $(JAVA_COMPILER_BIN)

test-java-parser: $(JAVA_COMPILER_BIN)
	$(PYTHON) tests/run_tests.py $(JAVA_COMPILER_BIN) tests/java/parser

test-java-semantic: $(JAVA_COMPILER_BIN)
	$(PYTHON) tests/run_tests.py $(JAVA_COMPILER_BIN) tests/java/semantic

test-java-tac: $(JAVA_COMPILER_BIN)
	$(PYTHON) tests/run_tests.py $(JAVA_COMPILER_BIN) tests/java/tac

test-java-compiler: test-java-parser test-java-semantic test-java-tac

test: test-lexer test-c test-cpp test-java test-parser test-expr-ast test-program-ast test-ast test-ast-ownership test-symtab test-semantic test-tac test-c-compiler test-cpp-compiler test-java-compiler

clean:
	@echo "Cleaning build and generated artifacts..."
	rm -f $(TARGET) $(LEXER_BIN) $(LEXER_C_BIN) $(LEXER_CPP_BIN) $(LEXER_JAVA_BIN) $(PARSER_BIN) $(EXPR_AST_BIN) $(PROGRAM_AST_BIN) $(AST_OWNERSHIP_BIN) $(SYMTAB_BIN) $(SEMANTIC_BIN) $(TEST_TAC_BIN) $(TAC_BIN) $(C_COMPILER_BIN) $(CPP_COMPILER_BIN) $(JAVA_COMPILER_BIN) *.exe *.o *.tab.c *.tab.h lex.yy.c *.actual *.output
	rm -rf $(BIN_DIR) $(BUILD_DIR)
	@echo "Clean completed."

help:
	@echo "=============================================================================="
	@echo " CompileCraft Makefile Help"
	@echo "=============================================================================="
	@echo " Targets:"
	@echo "   all              Default: checks toolchain and builds all lexers and parser (M3.3)"
	@echo "   toolchain-check  Verifies GCC, Flex, Bison, and Python executable paths and versions"
	@echo "   lexer            Builds baseline lexer (bin/compilecraft-lexer.exe)"
	@echo "   lexer-c          Builds C-subset lexer (bin/compilecraft-lexer-c.exe)"
	@echo "   lexer-cpp        Builds C++-subset lexer (bin/compilecraft-lexer-cpp.exe)"
	@echo "   lexer-java       Builds Java-subset lexer (bin/compilecraft-lexer-java.exe)"
	@echo "   parser           Builds baseline parser (bin/compilecraft-parser.exe); conflicts fail build"
	@echo "   test-lexer       Runs automated tests for baseline lexer (tests/lexer)"
	@echo "   test-c           Runs automated tests for C-subset lexer (tests/c)"
	@echo "   test-cpp         Runs automated tests for C++-subset lexer (tests/cpp)"
	@echo "   test-java        Runs automated tests for Java-subset lexer (tests/java)"
	@echo "   test-parser      Runs automated tests for baseline parser (tests/parser)"
	@echo "   test-expr-ast    Runs expression AST structure tests (tests/expr_ast; M4.2.5)"
	@echo "   test-program-ast Runs program/statement AST structure tests (tests/program_ast; M4.2.6)"
	@echo "   test-ast         Runs production --ast golden suite (tests/ast; M4.4)"
	@echo "   test-ast-ownership Runs AST list ownership unit test (M4.2.7)"
	@echo "   test-symtab      Runs Symbol Table unit tests (M5)"
	@echo "   test-semantic    Runs Semantic Analyzer regression suite (M6)"
	@echo "   test-tac-unit    Runs TAC structural unit tests (M7)"
	@echo "   test-tac-golden  Runs semantic-to-TAC golden suite (tests/tac/golden; M7)"
	@echo "   test-tac         Runs TAC unit + golden suites (M7)"
	@echo "   c-compiler       Builds C front-end driver (bin/compilecraft-c.exe; M9)"
	@echo "   test-c-parser    Runs C parser regression suite (tests/c/parser; M9)"
	@echo "   test-c-semantic  Runs C semantic regression suite (tests/c/semantic; M9)"
	@echo "   test-c-tac       Runs C TAC golden suite (tests/c/tac; M9)"
	@echo "   test-c-compiler  Runs all C front-end suites (M9)"
	@echo "   cpp-compiler      Builds C++ front-end driver (bin/compilecraft-cpp.exe; M10)"
	@echo "   test-cpp-parser   Runs C++ parser regression suite (tests/cpp/parser; M10)"
	@echo "   test-cpp-semantic Runs C++ semantic regression suite (tests/cpp/semantic; M10)"
	@echo "   test-cpp-tac      Runs C++ TAC golden suite (tests/cpp/tac; M10)"
	@echo "   test-cpp-compiler Runs all C++ front-end suites (M10)"
	@echo "   java-compiler     Builds Java front-end driver (bin/compilecraft-java.exe; M11)"
	@echo "   test-java-parser  Runs Java parser regression suite (tests/java/parser; M11)"
	@echo "   test-java-semantic Runs Java semantic regression suite (tests/java/semantic; M11)"
	@echo "   test-java-tac     Runs Java TAC golden suite (tests/java/tac; M11)"
	@echo "   test-java-compiler Runs all Java front-end suites (M11)"
	@echo "   test              Runs all automated test suites (lexer + parser + AST + symtab + semantic + tac + C + C++ + Java)"
	@echo "   clean            Removes compiled binaries and intermediate build artifacts"
	@echo "   help             Displays this help screen"
	@echo ""
	@echo " Tool Overrides:"
	@echo "   Override variables by passing them to mingw32-make:"
	@echo "     mingw32-make CC=path/to/gcc.exe FLEX=path/to/flex.exe BISON=path/to/bison.exe PYTHON=python"
	@echo "=============================================================================="
