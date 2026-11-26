# CompileCraft — C Front-End (M9)

## Pipeline

```
.c source → C Flex lexer → C Bison parser → shared AST
         → Symbol Table / Semantic Analyzer → TAC
```

Driver: `bin/compilecraft-c.exe <file.c>`  
Optional: `--ast` prints the shared AST and skips semantic/TAC.

## Supported subset

- Types: `int`, `float`, `_Bool` / `bool` (no `char`/`double` mapping)
- Literals: decimal integers, decimal floats, `true`, `false`
- `void` only in `int main(void)` / `int main()`
- Declarations / initialization / assignment
- Arithmetic, relational, equality, logical `&&` `||` `!`, unary `-`
- Statements: blocks, `if` / `if-else`, `while`, `for`, `return;`
- Increment/decrement as statements or `for` updates: `i++` `++i` `i--` `--i`

## For-loop lowering

```
for (init; cond; update) body
  ⇒  Block {
        init;
        While (cond) {
          Block { body; update; }
        }
      }
```

Missing `cond` becomes boolean true in the AST. Init declarations live in the outer block scope and are not visible after the loop.

## Faculty Rules 4 and 5 under the C subset (Hardened in M12)

Faculty definitions (unchanged):

- **Rule 4 — Type mismatch**: e.g. initializing / treating `bool` / `_Bool` with a numeric expression (`bool flag = 5 + 3;`), or comparing `bool` with a numeric type via `==` / `!=`.
- **Rule 5 — Invalid assignment**: incompatible assignment such as bool->int, or narrowing float->int without a cast.

The shared analyzer emits distinct diagnostics for these paths (`Type mismatch: ...` vs `Invalid assignment: ...`). With the M12 C99 `_Bool` / `bool` + `true` / `false` extension (matching `C_Compiler/tokens.def` and `type_spec`), **all six faculty rules are now independently verified in CompileCraft-C** (`tests/c/semantic/`).

## Unsupported (non-exhaustive)

- `char` / `double` / pointer / array / struct types
- Function definitions other than `main`
- `break` / `continue` / `switch` / `goto`
- Compound assignment (`+=` …)
- Preprocessor (rejected by lexer)
- String/character literals in executable statements
