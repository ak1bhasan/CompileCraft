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

PARSER_TAB_C    := $(BUILD_PARSER_DIR)/parser.tab.c
PARSER_TAB_H    := $(BUILD_PARSER_DIR)/parser.tab.h
# Parser-linked Flex object (distinct from standalone build/lex.yy.o).
PARSER_LEX_O    := $(BUILD_PARSER_DIR)/lex.yy.o
# AST core object (M4.1); linked into the parser binary only (M4.2.2).
AST_O           := $(BUILD_DIR)/ast/ast.o
# -d: header, -v: parser.output
# Fail the build on unresolved shift/reduce or reduce/reduce conflicts.
# Do not use %expect — conflicts must fail the build, not be hidden.
BISONFLAGS      ?= -d -v -Werror=conflicts-sr -Werror=conflicts-rr

.PHONY: all toolchain-check lexer lexer-c lexer-cpp lexer-java parser test-lexer test-c test-cpp test-java test-parser test clean help

all: toolchain-check $(LEXER_BIN) $(LEXER_C_BIN) $(LEXER_CPP_BIN) $(LEXER_JAVA_BIN) $(PARSER_BIN)
	@echo ""
	@echo "=============================================================================="
	@echo " CompileCraft - Build Succeeded (Milestone 3.3: Parser Hardening)"
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

$(BUILD_PARSER_DIR)/parser.tab.o: $(PARSER_TAB_C) $(PARSER_TAB_H)
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc/parser -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

# Parser-specific lexer object: reuse Flex output from build/lex.yy.c, but
# force-include Bison's parser.tab.h before tokens.h (via -include) so the
# parser binary and lexer share one YYSTYPE layout when %union grows in M4.2+.
# Standalone compilecraft-lexer.exe keeps using tokens.h's fallback unchanged.
$(PARSER_LEX_O): $(BUILD_DIR)/lex.yy.c src/lexer/tokens.h src/lexer/tokens.def $(PARSER_TAB_H)
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -I$(BUILD_PARSER_DIR) -Isrc \
		-include parser.tab.h \
		-c $(BUILD_DIR)/lex.yy.c -o $@

$(BUILD_PARSER_DIR)/tokens.o: src/lexer/tokens.c src/lexer/tokens.h src/lexer/tokens.def $(PARSER_TAB_H)
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -DBISON_OWNS_YYLVAL -Isrc/lexer -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

$(BUILD_PARSER_DIR)/main.o: src/parser/main.c src/parser/parser.h $(PARSER_TAB_H)
	@mkdir -p $(BUILD_PARSER_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc/parser -I$(BUILD_PARSER_DIR) -Isrc -c $< -o $@

$(PARSER_BIN): $(BUILD_PARSER_DIR)/parser.tab.o $(PARSER_LEX_O) $(BUILD_PARSER_DIR)/tokens.o $(BUILD_PARSER_DIR)/main.o $(AST_O)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^

parser: $(PARSER_BIN)

test-parser: $(PARSER_BIN)
	$(PYTHON) tests/run_tests.py $(PARSER_BIN) tests/parser

test: test-lexer test-c test-cpp test-java test-parser

clean:
	@echo "Cleaning build and generated artifacts..."
	rm -f $(TARGET) $(LEXER_BIN) $(LEXER_C_BIN) $(LEXER_CPP_BIN) $(LEXER_JAVA_BIN) $(PARSER_BIN) *.exe *.o *.tab.c *.tab.h lex.yy.c *.actual *.output
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
	@echo "   test             Runs all automated test suites (87 lexer + parser hardening suite)"
	@echo "   clean            Removes compiled binaries and intermediate build artifacts"
	@echo "   help             Displays this help screen"
	@echo ""
	@echo " Tool Overrides:"
	@echo "   Override variables by passing them to mingw32-make:"
	@echo "     mingw32-make CC=path/to/gcc.exe FLEX=path/to/flex.exe BISON=path/to/bison.exe PYTHON=python"
	@echo "=============================================================================="
