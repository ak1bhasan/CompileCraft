# CompileCraft — C++ Front-End (M10)

## Pipeline

```
.cpp source → C++ Flex lexer → C++ Bison parser → shared AST
           → Symbol Table / Semantic Analyzer → TAC
```

Driver: `bin/compilecraft-cpp.exe <file.cpp>` (or `bin/compilecraft.exe <file.cpp>`)

Optional: `--tokens`, `--ast`, or `--symtab` prints tokens/AST/symbols and skips TAC.

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

## Unsupported (non-exhaustive)

- Classes, inheritance, virtuals, templates, STL containers
- Pointers, references, operator overloading, exceptions, `using namespace std`
- Input/error streams (`std::cin`, `std::cerr`) and unqualified `cout`/`endl`
- `char` / `double` / `std::string` / arrays / structs
- Compound assignment (`+=` …)
- Other preprocessor directives (`#define`, `#include <vector>`, etc. rejected with `Lexical Error`)
- Full ISO C++
