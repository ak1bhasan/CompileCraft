# CompileCraft — C Front-End (M9)

## Pipeline

```
.c source → C Flex lexer → C Bison parser → shared AST
         → Symbol Table / Semantic Analyzer → TAC
```

Driver: `bin/compilecraft-c.exe <file.c>`  
Optional: `--ast` prints the shared AST and skips semantic/TAC.

## Supported subset

- Types: `int`, `float` (no `bool`/`char`/`double` mapping)
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

## Faculty Rules 4 and 5 under the C subset

Faculty definitions (unchanged):

- **Rule 4 — Type mismatch**: e.g. initializing / treating `bool` with a numeric expression (`bool b = 5 + 3.2;`), or comparing `bool` with a numeric type via `==` / `!=`.
- **Rule 5 — Invalid assignment**: incompatible assignment such as bool→int, or narrowing float→int without a cast.

The shared analyzer emits distinct diagnostics for these paths (`Type mismatch: …` vs `Invalid assignment: …`). On the **baseline `.mc`** language (which has `bool`), both are covered independently.

The **C subset** currently admits only `int` and `float` (no `bool` / `true` / `false` in the C lexer or grammar). Every shared-analyzer path that prints `Type mismatch:` requires a boolean operand. Therefore **Rule 4 cannot be independently demonstrated in CompileCraft-C without extending the type system**. Rule 5 **can** be shown via float→int assignment (`tests/c/semantic/error_invalid_assignment.*`).

**Smallest justified extension (not implemented here):** add C99 `_Bool` / `bool` plus `true`/`false` (or a documented C-subset `bool`) to the C lexer and `type_spec`, then add a Rule 4 golden such as equality of a bool-typed value with an `int`, without changing faculty rule wording.

## Unsupported (non-exhaustive)

- `char` / `double` / `_Bool` / `bool` / pointer / array / struct types
- Function definitions other than `main`
- `break` / `continue` / `switch` / `goto`
- Compound assignment (`+=` …)
- Preprocessor (rejected by lexer)
- String/character literals in executable statements
