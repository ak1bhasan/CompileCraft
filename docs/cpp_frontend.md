# CompileCraft — C++ Front-End (M10)

## Pipeline

```
.cpp source → C++ Flex lexer → C++ Bison parser → shared AST
           → Symbol Table / Semantic Analyzer → TAC
```

Driver: `bin/compilecraft-cpp.exe <file.cpp>`  
Optional: `--ast` prints the shared AST and skips semantic/TAC.

## Supported procedural subset

- Types: `int`, `float`, `bool`
- Literals: integers, floats, `true`, `false`
- `void` only in `int main()` / `int main(void)`
- Declarations / initialization / assignment
- Arithmetic, relational, equality, logical `&&` `||` `!`, unary `-`
- Statements: blocks, `if` / `if-else`, `while`, `for`, `return;`
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

- Classes, inheritance, virtuals, templates, STL
- Pointers, references, operator overloading, exceptions
- Stream I/O (`cout`/`cin` remain identifiers but are not special-cased)
- `char` / `double` / arrays / structs
- Compound assignment (`+=` …)
- Preprocessor (rejected by lexer)
- Full ISO C++
