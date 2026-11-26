# CompileCraft — C Front-End (M9)

## Pipeline

```
.c source → C Flex lexer → C Bison parser → shared AST
         → Symbol Table / Semantic Analyzer → TAC
```

Driver: `bin/compilecraft-c.exe <file.c>` (or `bin/compilecraft.exe <file.c>`)

Optional: `--tokens`, `--ast`, or `--symtab` prints tokens/AST/symbols and skips TAC.

## Supported subset

- Preprocessor directives: `#include <stdio.h>` at line start (optional trailing whitespace/`//` comment)
- Types: `int`, `float`, `_Bool` / `bool` (no `char`/`double` mapping or `string` variables)
- Literals: decimal integers, decimal floats, `true`, `false`, plus `STRING_LITERAL` inside `printf`
- `void` only in `int main(void)` / `int main()`
- Declarations / initialization / assignment
- Arithmetic, relational, equality, logical `&&` `||` `!`, unary `-`
- Statements: blocks, `if` / `else if` / `if-else`, `while`, `for`, `printf(...)` (`OutputPrintf` AST node validated in semantic analysis and lowered to `arg` + `printf` TAC instructions), `return;`
- Increment/decrement as statements or `for` updates: `i++` `++i` `i--` `--i`

## Supported `printf` subset

- First argument must be a `STRING_LITERAL` format string; empty `printf()` and non-string format arguments are rejected.
- Supported format specifiers: `%d` (`int`), `%f` (`float`), `%s` (`string`), and `%%` (literal `%`).
- Supported escape sequences in string literals: `\n`, `\t`, `\r`, `\\`, `\"`, `\'`, `\0`.
- Unsupported conversion specifiers (e.g. `%x`, `%c`, trailing `%`), missing or extra arguments, and argument type mismatches emit line-numbered diagnostics during semantic analysis and suppress TAC generation.

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

- `char` / `double` / pointer / array / struct / `string` variable types
- Format flags/width/precision specifiers (`%.2f`, `%04d`) and unsupported conversions (`%c`, `%x`, `%u`, `%p`)
- User-defined functions or calls other than `printf(...)` (e.g. `scanf`, `printf()` with 0 arguments)
- `break` / `continue` / `switch` / `goto`
- Compound assignment (`+=` …)
- Other preprocessor directives (`#define`, `#include <stdlib.h>`, etc. rejected with `Lexical Error`)
- String/character arithmetic or assigning string literals to numeric/boolean variables (rejected by semantic analysis)
