# CompileCraft — Three-Address Code (TAC)

> **Milestone**: M7  
> **Scope**: Baseline mini-language (`.mc`) only

## Pipeline position

```
Lexer → Parser → AST → Semantic Analyzer → TAC Generator
```

TAC is emitted only after a successful semantic analysis pass. The integration driver is `bin/compilecraft-tac.exe` (M7 test/integration harness, not the M8 unified CLI).

## Instruction forms

| Form | Example |
|---|---|
| Copy | `x = 10` |
| Binary | `t1 = a + b` |
| Unary | `t2 = -x`, `t3 = !flag` |
| Conditional jump | `if t1 goto L2` |
| Unconditional jump | `goto L3` |
| Label | `L1:` |
| Print | `print y` |

Temporaries: `t1`, `t2`, …  
Labels: `L1`, `L2`, …

## Control flow shape

**if / if-else**

```
if cond goto L_then
goto L_else_or_end
L_then:
  …
  goto L_end        # if-else only
L_else:             # if-else only
  …
L_end:
```

**while**

```
L_head:
  cond
  if cond goto L_body
  goto L_end
L_body:
  …
  goto L_head
L_end:
```

## Logical expressions (DEC-07)

DEC-07 remains **OPEN** regarding short-circuit evaluation of `&&` / `||` operands.

**M7 interim policy (documented, not a final language freeze):**

- Value-producing `&&` / `||` emit eager three-address ops: `t = a && b`, `t = a || b` (both operands evaluated).
- `if` / `while` conditions still use label-based branching around statement bodies.

Alternatives under DEC-07:

1. **Eager** (current interim): simpler IR; both sides always evaluated.
2. **Short-circuit**: emit jumps so the right operand is skipped when the left decides the result; preferred for control conditions in the working engineering default.

Finalizing DEC-07 is required before treating logical TAC semantics as frozen.

## Failure handling

`tac_generate_program` returns `NULL` on any allocation or emission failure and does not hand back a partial instruction list. Callers must treat `NULL` as hard failure.

## Tests

| Suite | Target |
|---|---|
| Unit | `mingw32-make test-tac-unit` → `bin/test-tac.exe` |
| Golden + semantic gate | `mingw32-make test-tac-golden` → `bin/compilecraft-tac.exe` + `tests/tac/golden/` |
