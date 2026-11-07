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

BIN_DIR       ?= bin
BUILD_DIR     ?= build
BUILD_C_DIR   ?= $(BUILD_DIR)/c

LEXER_BIN     ?= $(BIN_DIR)/compilecraft-lexer.exe
LEXER_C_BIN   ?= $(BIN_DIR)/compilecraft-lexer-c.exe

.PHONY: all toolchain-check lexer lexer-c test-lexer test-c test clean help

all: toolchain-check $(LEXER_BIN) $(LEXER_C_BIN)
	@echo ""
	@echo "=============================================================================="
	@echo " CompileCraft - Build Succeeded (Milestone 2.1: C Lexical Analyzer)"
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
	@echo ""
	@echo " Run 'mingw32-make test' to execute all regression test suites."
	@echo "=============================================================================="

toolchain-check:
	@echo "Checking toolchain executables..."
	@$(CC) --version | head -n 1
	@$(FLEX) --version
	@$(BISON) --version | head -n 1

# ------------------------------------------------------------------------------
# Baseline Mini-Language Lexer (Milestone 2.0 reference)
# ------------------------------------------------------------------------------
$(BUILD_DIR)/lex.yy.c: src/lexer/lexer.l src/lexer/tokens.h src/lexer/tokens.def
	@mkdir -p $(BUILD_DIR)
	$(FLEX) -o $(BUILD_DIR)/lex.yy.c src/lexer/lexer.l

$(LEXER_BIN): $(BUILD_DIR)/lex.yy.c src/lexer/tokens.c src/lexer/tokens.h src/lexer/tokens.def src/lexer/main.c
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -Isrc/lexer -Isrc -o $(LEXER_BIN) $(BUILD_DIR)/lex.yy.c src/lexer/tokens.c src/lexer/main.c

lexer: $(LEXER_BIN)

test-lexer: $(LEXER_BIN)
	$(PYTHON) tests/run_tests.py $(LEXER_BIN) tests/lexer

# ------------------------------------------------------------------------------
# C-Subset Lexer (Milestone 2.1)
# ------------------------------------------------------------------------------
$(BUILD_C_DIR)/lex.yy.c: src/frontend_c/lexer.l src/frontend_c/tokens.h src/frontend_c/tokens.def
	@mkdir -p $(BUILD_C_DIR)
	$(FLEX) -o $(BUILD_C_DIR)/lex.yy.c src/frontend_c/lexer.l

$(LEXER_C_BIN): $(BUILD_C_DIR)/lex.yy.c src/frontend_c/tokens.c src/frontend_c/tokens.h src/frontend_c/tokens.def src/frontend_c/main_c.c
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -Isrc/frontend_c -Isrc -o $(LEXER_C_BIN) $(BUILD_C_DIR)/lex.yy.c src/frontend_c/tokens.c src/frontend_c/main_c.c

lexer-c: $(LEXER_C_BIN)

test-c: $(LEXER_C_BIN)
	$(PYTHON) tests/run_tests.py $(LEXER_C_BIN) tests/c

test: test-lexer test-c

clean:
	@echo "Cleaning build and generated artifacts..."
	rm -f $(TARGET) $(LEXER_BIN) $(LEXER_C_BIN) *.exe *.o *.tab.c *.tab.h lex.yy.c *.actual *.output
	rm -rf $(BIN_DIR) $(BUILD_DIR)
	@echo "Clean completed."

help:
	@echo "=============================================================================="
	@echo " CompileCraft Makefile Help"
	@echo "=============================================================================="
	@echo " Targets:"
	@echo "   all              Default: checks toolchain and builds both lexers"
	@echo "   toolchain-check  Verifies GCC, Flex, and Bison executable paths and versions"
	@echo "   lexer            Builds baseline lexer (bin/compilecraft-lexer.exe)"
	@echo "   lexer-c          Builds C-subset lexer (bin/compilecraft-lexer-c.exe)"
	@echo "   test-lexer       Runs automated tests for baseline lexer (tests/lexer)"
	@echo "   test-c           Runs automated tests for C-subset lexer (tests/c)"
	@echo "   test             Runs all automated test suites (baseline + C)"
	@echo "   clean            Removes compiled binaries and intermediate build artifacts"
	@echo "   help             Displays this help screen"
	@echo ""
	@echo " Tool Overrides:"
	@echo "   Override variables by passing them to mingw32-make:"
	@echo "     mingw32-make CC=path/to/gcc.exe FLEX=path/to/flex.exe BISON=path/to/bison.exe PYTHON=python"
	@echo "=============================================================================="
