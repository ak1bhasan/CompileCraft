# CompileCraft — C++ Front-End (M10)

## Pipeline

```
.cpp source → C++ Flex lexer → C++ Bison parser → shared AST
           → Symbol Table / Semantic Analyzer → TAC
```

Driver: `bin/compilecraft-cpp.exe [--ast | --symtab | --run] <file.cpp>` (or `bin/compilecraft.exe [--tokens | --ast | --symtab | --run] <file.cpp>`)

Optional: `--tokens`, `--ast`, or `--symtab` skips TAC/execution; `--run` compiles to TAC and executes via the Shared TAC VM (`docs/vm.md`).

## Supported procedural subset

- Preprocessor directives: `#include <iostream>` at line start (optional trailing whitespace/`//` comment)
- Types: `int`, `float`, `bool`
- Literals: integers, floats, `true`, `false`, plus `STRING_LITERAL` inside `std::cout` output chains
- `void` only in `int main()` / `int main(void)`
- Declarations / initialization / assignment
- Arithmetic, relational, equality, logical `&&` `||` `!`, unary `-`
- Statements: blocks, `if` / `else if` / `if-else`, `while`, `for`, `std::cout << ...` (chained expressions and `std::endl` lowered to `Output` / `OutputLn` or non-scoping `Seq` AST nodes -> TAC `print` / `println`), `return;`
- Increment/decrement as statements or `for` updates: `i++` `++i` `i--` `--i`

## Boolean support

`bool`, `true`, and `false` are wired through the C++ lexer, parser, shared AST
(`AST_TYPE_BOOL` / `AST_LIT_BOOL`), symbol table, semantic analyzer, and TAC
(literal printing as `true`/`false`).

This enables independent Faculty Rule 4 vs Rule 5 diagnostics under C++:

- **Rule 4** — e.g. `bool flag = 5 + 3;` → `Type mismatch: …`
- **Rule 5** — e.g. `int x = float_expr;` → `Invalid assignment: …`

## For-loop lowering

Same proven shape as CompileCraft-C (M9):

```
for (init; cond; update) body
  ⇒  Block {
        init;
        While (cond) {
          Block { body; update; }
        }
      }
```

Init declarations are scoped to the outer block and are not visible after the loop.

## Simplified Shared Scope & Initializer Semantics

CompileCraft uses a unified simplified scope model across its bounded C, C++, and Java subsets (not claiming full ISO C++ compliance):
- In standard C++, a declarator enters scope immediately *before* its initializer, making inner `{ int x = x + 1; }` refer to the uninitialized inner `x`.
- In CompileCraft-C++, initializers are evaluated before inserting the new binding (`src/semantic/semantic.c` and `src/tac/tac.c`), so `int x = 10; { int x = x + 1; }` resolves the initializer to outer `x` and produces inner `x = 11` (leaving outer `x = 10`).
- Block-local uninitialized declarations reset cleanly per block/loop entry (`TAC_OP_UNINIT`).

## Unsupported (non-exhaustive)

- Classes, inheritance, virtuals, templates, STL containers
- Pointers, references, operator overloading, exceptions, `using namespace std`
- Input/error streams (`std::cin`, `std::cerr`) and unqualified `cout`/`endl`
- `char` / `double` / `std::string` / arrays / structs
- Compound assignment (`+=` …)
- Other preprocessor directives (`#define`, `#include <vector>`, etc. rejected with `Lexical Error`)
- Full ISO C++
