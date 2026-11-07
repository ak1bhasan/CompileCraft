MSYS2_ROOT ?= E:/msys64

ifeq ($(origin CC),default)
CC := $(MSYS2_ROOT)/ucrt64/bin/gcc.exe
endif
CC ?= $(MSYS2_ROOT)/ucrt64/bin/gcc.exe

FLEX  ?= $(MSYS2_ROOT)/usr/bin/flex.exe
BISON ?= $(MSYS2_ROOT)/usr/bin/bison.exe

CFLAGS  ?= -Wall -Wextra -pedantic -std=c11 -Isrc
TARGET  ?= compilecraft.exe

.PHONY: all toolchain-check clean help

all: toolchain-check
	@echo ""
	@echo "=============================================================================="
	@echo " CompileCraft - Build Foundation Initialized (Stage 1)"
	@echo "=============================================================================="
	@echo " Verified Toolchain:"
	@echo "   CC    : $(CC)"
	@echo "   FLEX  : $(FLEX)"
	@echo "   BISON : $(BISON)"
	@echo ""
	@echo " Status: Compiler modules under src/ are scheduled for Milestone 1+."
	@echo " Run 'mingw32-make help' for available targets."
	@echo "=============================================================================="

toolchain-check:
	@echo "Checking toolchain executables..."
	@$(CC) --version | head -n 1
	@$(FLEX) --version
	@$(BISON) --version | head -n 1

clean:
	@echo "Cleaning build and generated artifacts..."
	rm -f $(TARGET) *.exe *.o *.tab.c *.tab.h lex.yy.c *.actual *.output
	rm -rf bin build
	@echo "Clean completed."

help:
	@echo "=============================================================================="
	@echo " CompileCraft Makefile Help"
	@echo "=============================================================================="
	@echo " Targets:"
	@echo "   all              Default target: performs toolchain-check and displays status"
	@echo "   toolchain-check  Verifies GCC, Flex, and Bison executable paths and versions"
	@echo "   clean            Removes compiled binaries and intermediate build artifacts"
	@echo "   help             Displays this help screen"
	@echo ""
	@echo " Tool Overrides:"
	@echo "   Override variables by passing them to mingw32-make:"
	@echo "     mingw32-make CC=path/to/gcc.exe FLEX=path/to/flex.exe BISON=path/to/bison.exe"
	@echo "=============================================================================="
