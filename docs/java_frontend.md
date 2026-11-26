# CompileCraft — Java Front-End (M11)

## Pipeline

```
.java source → Java Flex lexer → Java Bison parser → shared AST
             → Symbol Table / Semantic Analyzer → TAC
```

Driver: `bin/compilecraft-java.exe [--ast | --symtab | --run] <file.java>` (or `bin/compilecraft.exe [--tokens | --ast | --symtab | --run] <file.java>`)

Optional: `--tokens`, `--ast`, or `--symtab` skips TAC/execution; `--run` compiles to TAC and executes via the Shared TAC VM (`docs/vm.md`).

## Supported Java Subset

### Imports & Class / Main Wrapper
- Optional `import java.util.Scanner;` or `import java.util.*;` (also implicitly available without import in this subset)
- `public class <Name> { public static void main(String[] args) { ... } }`
- `class <Name> { public static void main(String[] args) { ... } }` (without `public`)
- Also accepts `String args[]` parameter syntax.
- `String`, `Scanner`, and `main` remain contextual `IDENTIFIER` tokens validated in the grammar/semantic analyzer.
- The class and `main` wrapper lowers directly to `AST_PROGRAM` containing the `main` method body statements without fabricating unnecessary class or method AST nodes.

### Data Types & Literals
- Types: `int`, `float`, `boolean`, `String`, `Scanner`
- Literals: decimal integers, decimal floats, `true`, `false`, `STRING_LITERAL`
- `void` only in `public static void main(...)`

### Interactive `Scanner` Subset (M16)
- Construction: `Scanner sc = new Scanner(System.in);` (sources other than `System.in` are rejected semantically).
- Supported methods (0-argument calls on an initialized `Scanner` variable):
  - `sc.nextInt()` → `int` (complete whitespace-delimited token validation)
  - `sc.nextFloat()` → `float` (complete whitespace-delimited token validation)
  - `sc.nextBoolean()` → `boolean` (case-insensitive `true` / `false`)
  - `sc.next()` → `String` (whitespace-delimited token)
  - `sc.nextLine()` → `String` (reads remainder of current line up to `\n`, stripping trailing `\r`)
- `Scanner` variables cannot be used as numeric/string operands, printed, or assigned non-`Scanner` values; uninitialized `Scanner` reads and unsupported methods (`nextDouble()`, etc.) are rejected at compile time.

### Declarations, Statements & Expressions
- Variable declarations with optional initializer (`int x;`, `int x = 10;`, `float y = 2.5;`, `boolean active = true;`)
- Assignments (`x = expr;`)
- Arithmetic: `+`, `-`, `*`, `/`, `%`, unary `-`, parentheses
- Relational & equality: `<`, `>`, `<=`, `>=`, `==`, `!=`
- Logical: `&&`, `||`, `!`
- Control statements: compound blocks `{ ... }`, `if`, `else if`, `if-else`, `while`, `for`, `return;`
- Console output: `System.out.print(expr);`, `System.out.println(expr);`, `System.out.println();` (`Output` / `OutputLn` AST nodes preserving `Binary +` expression trees in AST, validated left-to-right for Java string concatenation in semantic analysis, and lowered to `print` / `println` fragments during TAC generation)
- Increment/decrement as standalone statements or `for` updates: `i++`, `++i`, `i--`, `--i`

## Boolean Support

`boolean`, `true`, and `false` are traced end-to-end through the Java Flex lexer (`KW_BOOLEAN`, `KW_TRUE`, `KW_FALSE`), Java Bison parser (`AST_TYPE_BOOL`, `AST_LIT_BOOL`), shared symbol table (`TYPE_BOOL`), shared semantic analyzer, and TAC generator (`true` / `false` literals).

## For-Loop Lowering & Scope

```
for (init; cond; update) body
  ⇒  Block {
        init;
        While (cond) {
          Block { body; update; }
        }
      }
```

- Missing `cond` defaults to boolean `true`.
- Init declarations live in the enclosing synthetic `Block` scope and are not accessible after the loop (enforced by Rule 3 scope checks).

## Semantic Analysis & TAC Generation

- Reuses the shared scoped Symbol Table (`src/symbol_table/`) and Semantic Analyzer (`src/semantic/`) enforcing all six faculty rules with source line numbers:
  1. Undeclared variable use
  2. Redeclaration in same scope
  3. Scope violation (including `for`-loop init variables used after the loop)
  4. Type mismatch (e.g. `boolean flag = 5 + 3;` and `boolean`/`int` equality)
  5. Invalid assignment (e.g. narrowing `float` to `int`)
  6. Invalid expressions (e.g. logical operators on numeric operands, non-boolean `if`/`while` conditions)
- Reuses the shared TAC generator (`src/tac/`) using `t1, t2, ...` and `L1, L2, ...`, and executes verified TAC via the Shared TAC VM (`src/vm/`, `--run`).
- Lexical, syntax, or semantic errors abort compilation cleanly with exit code `1` and produce no TAC output or VM execution.

## Simplified Shared Scope & Initializer Semantics (Limitation vs Standard Java)

CompileCraft uses a unified simplified scope model shared with its C and C++ subsets rather than implementing full JLS compliance:
- **Nested-block local shadowing**: Standard Java (JLS §6.4) forbids declaring a local variable in a nested block with the same name as an enclosing local variable of the same method (`int x = 10; { int x = ...; }`). CompileCraft's bounded Java subset **currently permits nested-block shadowing** (`SymbolTable` checks redeclaration within the current block only).
- **Initializer resolution order**: Because initializers are evaluated before binding the new variable (`src/semantic/semantic.c` and `src/tac/tac.c`), `int x = 10; { int x = x + 1; }` resolves RHS `x` to outer `10` and sets inner `x = 11`, leaving outer `x = 10` (consistent with the shared C/C++ subset model).
- Block-local declarations without initializers reset cleanly on each block or loop iteration (`TAC_OP_UNINIT`).

## Unsupported Java Features (Non-Exhaustive)

- General classes, multiple classes, fields, methods, constructors, inheritance, and interfaces
- Arbitrary `new` expressions, `this`, arbitrary member access/calls (`System.err.println`, `nextDouble()`, etc.), and array indexing/allocation
- `System.out.print()` with zero arguments (rejected with `Syntax Error`)
- Generics, packages, arbitrary `import` packages, and `try-catch` exceptions
- `char` / `double` declarations, compound assignment (`+=` ...), `break` / `continue`, `switch`
- Strict JLS local-variable non-shadowing rules (nested block shadowing is allowed in this subset as documented above)
- JVM bytecode generation (executes via CompileCraft's Shared TAC VM `--run`, not `javac`/JVM)
