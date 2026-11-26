# CompileCraft — C Front-End (M9)

## Pipeline

```
.c source → C Flex lexer → C Bison parser → shared AST
         → Symbol Table / Semantic Analyzer → TAC
```

Driver: `bin/compilecraft-c.exe [--ast | --symtab | --run] <file.c>` (or `bin/compilecraft.exe [--tokens | --ast | --symtab | --run] <file.c>`)

Optional: `--tokens`, `--ast`, or `--symtab` skips TAC/execution; `--run` compiles to TAC and executes via the Shared TAC VM (`docs/vm.md`).

## Supported subset

- Preprocessor directives: `#include <stdio.h>` at line start (optional trailing whitespace/`//` comment)
- Types: `int`, `float`, `_Bool` / `bool`, plus fixed-size `char name[N];` string buffers (`N >= 2` for writable input)
- Literals: decimal integers, decimal floats, `true`, `false`, plus `STRING_LITERAL` inside `printf` / `scanf`
- `void` only in `int main(void)` / `int main()`
- Declarations / initialization / assignment
- Arithmetic, relational, equality, logical `&&` `||` `!`, unary `-`
- Statements: blocks, `if` / `else if` / `if-else`, `while`, `for`, `printf(...)`, `scanf(...)`, `return;`
- Increment/decrement as statements or `for` updates: `i++` `++i` `i--` `--i`

## Supported `printf` & `scanf` subsets

### `printf`
- First argument must be a `STRING_LITERAL` format string; empty `printf()` and non-string format arguments are rejected.
- Supported format specifiers: `%d` (`int`), `%f` and `%.[0-20]f` (`float`, e.g. `%.2f`, `%.8f`), `%s` (`char[]` / `string`), and `%%` (literal `%`).
- Supported escape sequences in string literals: `\n`, `\t`, `\r`, `\\`, `\"`, `\'`, `\0`.
- Unsupported conversion specifiers (e.g. `%x`, `%c`, trailing `%`), missing or extra arguments, and argument type mismatches emit line-numbered diagnostics during semantic analysis and suppress TAC generation.

### `scanf` (M16)
- First argument must be a `STRING_LITERAL` format string; empty `scanf()` is rejected.
- Supported specifiers:
  - `%d` with `&<int_var>` (numeric-prefix extraction leaving delimiters unread)
  - `%f` with `&<float_var>` (numeric-prefix extraction leaving delimiters unread)
  - `%s` and `%Ns` (`N >= 1`) with `<char_array>` **without `&`**
  - `%%` (literal `%` match) and literal/whitespace format characters (`scan_lit`, `scan_ws`)
- Safety validation:
  - Address-of (`&`) is allowed only inside `scanf` arguments (`printf("%d", &x)` is rejected semantically).
  - `char` buffers must have capacity `>= 2` (so `char s[1]` is rejected for `%s`), `%0s` is rejected, and explicit width `N` must satisfy `1 <= N <= capacity - 1`.
  - Missing arguments, extra arguments, wrong target types, and unsupported specifiers (such as `%c` or `%x`) are rejected at compile time.

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

## Simplified Shared Scope & Initializer Semantics

CompileCraft uses a unified simplified scope model across its bounded C, C++, and Java subsets (not claiming full ISO C compliance):
- In standard C (C99/C11), a variable declarator enters scope *before* its initializer, making self-referential `{ int x = x + 1; }` read the uninitialized inner `x`.
- In CompileCraft-C, initializers are evaluated before inserting the new binding (`src/semantic/semantic.c` and `src/tac/tac.c`), so in `int x = 10; { int x = x + 1; }`, the initializer resolves to the outer `x` and produces inner `x = 11` (while leaving outer `x = 10`).
- Block-local declarations without initializers reset per block/loop entry (`TAC_OP_UNINIT`).

## Faculty Rules 4 and 5 under the C subset (Hardened in M12)

Faculty definitions (unchanged):

- **Rule 4 — Type mismatch**: e.g. initializing / treating `bool` / `_Bool` with a numeric expression (`bool flag = 5 + 3;`), or comparing `bool` with a numeric type via `==` / `!=`.
- **Rule 5 — Invalid assignment**: incompatible assignment such as bool->int, or narrowing float->int without a cast.

The shared analyzer emits distinct diagnostics for these paths (`Type mismatch: ...` vs `Invalid assignment: ...`). With the M12 C99 `_Bool` / `bool` + `true` / `false` extension (matching `C_Compiler/tokens.def` and `type_spec`), **all six faculty rules are now independently verified in CompileCraft-C** (`tests/c/semantic/`).

## Unsupported (non-exhaustive)

- Scalar `char` / `double` / pointer / `char` element indexing (`s[i]`) / struct types
- Width/flag modifiers on `printf` (`%04d`, `%+d`, `%10s`) and unsupported conversions (`%c`, `%x`, `%u`, `%p`, precision `> 20`)
- User-defined functions or calls other than `printf(...)` and `scanf(...)`
- `break` / `continue` / `switch` / `goto`
- Compound assignment (`+=` …)
- Other preprocessor directives (`#define`, `#include <stdlib.h>`, etc. rejected with `Lexical Error`)
- String/character arithmetic or assigning string literals to numeric/boolean variables (rejected by semantic analysis)
