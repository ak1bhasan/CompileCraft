# CompileCraft — Shared TAC Virtual Machine (VM)

> **Milestone**: M15–M16
> **Scope**: Unified Three-Address Code execution and interactive runtime I/O across **C** (`compilecraft-c`), **C++** (`compilecraft-cpp`), **Java** (`compilecraft-java`), unified CLI `compilecraft.exe --run`, and Electron Interactive Console

---

## 1. Pipeline Position

```
Source Code → Flex → Bison → AST → Semantic Analysis → TAC → Shared TAC VM → Program Output
```

Execution is strictly **compilation-gated**: if lexical, syntax, or semantic analysis fails (or if TAC generation returns `NULL`), compilation aborts immediately and the VM does **not** run.

---

## 2. Implementation Architecture

Located under `src/vm/`:

| File | Responsibility |
|---|---|
| `src/vm/vm_value.h` / `vm_value.c` | Tagged runtime values (`VM_VAL_UNINIT`, `VM_VAL_INT`, `VM_VAL_FLOAT`, `VM_VAL_BOOL`, `VM_VAL_STRING`), deep copies, literal/escape parsing, and memory cleanup (`vm_value_free`). |
| `src/vm/vm.h` / `vm.c` | VM state (`VmState`), dynamic variable & temporary storage, argument stack for `printf`, pre-indexed label jump table, fetch/decode/execute loop (all TAC opcodes including `TAC_OP_ITOF` & `TAC_OP_UNINIT`), runtime safety checks, and bounded execution limit. |

All three front-end drivers (`C_Compiler/main_compiler.c`, `CPP_Compiler/main_compiler.c`, `Java_Compiler/main_compiler.c`) link `$(VM_OBJS)` directly and execute programs inside `--run` mode without invoking any external compiler (`gcc`, `g++`, `javac`).

---

## 3. Runtime Value Semantics, Precision & Overflow Policy

- **Lexical scope & uninitialized slots (Simplified Shared Subset Semantics)**:
  - During TAC generation (`src/tac/tac.c`), lexical `AST_BLOCK` scopes isolate shadowed declarations into dynamically sized unique TAC variable slots (`x`, `x$2`, ...), preventing inner blocks from overwriting outer declarations. Block/loop declarations without initializers emit `TAC_OP_UNINIT` to reset slot state on every iteration or block entry so stale values cannot leak across iterations.
  - **Initializer lookup order vs language standards**: CompileCraft uses one simplified shared scope model across its C, C++, and Java subsets: nested-block shadowing is allowed across all three subsets, and variable initializers are analyzed and lowered *before* inserting the new declaration into the scope frame. Therefore, `int x = 10; { int x = x + 1; }` resolves the initializer's `x` to the enclosing outer variable (`10`) and sets inner `x = 11`. This is an intentional subset-specific design choice (not full ISO C, C++, or Java standard compliance): standard C/C++ bring the declarator into scope *before* its initializer (making inner `int x = x + 1;` self-referential/uninitialized), and standard Java forbids shadowing an enclosing local variable in nested blocks.
- **Tagged types & `int → float` widening**: Every variable, temporary (`t1`, `t2`, ...), and literal carries a runtime kind (`int`, `float`, `bool`, `string`, or `uninitialized`). Implicit `int`-to-`float` initialization and assignment accepted by semantic analysis lower via `TAC_OP_ITOF` (`dest = (float)src1`), ensuring float variables hold `VM_VAL_FLOAT` throughout arithmetic, division, comparisons, and `printf("%f")`.
- **Numeric arithmetic & signed integer overflow policy**:
  - `int op int` produces `int` (truncated integer division for `/`, integer remainder for `%`, guarded against `0` divisor).
  - **Signed integer overflow (`+`, `-`, `*`, unary `-`)**: Implemented via explicit unsigned 32-bit modulo-$2^{32}$ arithmetic (`uint32_t` mapped cleanly back to signed 32-bit `int`), providing portable two's-complement wrap-around without C signed-overflow undefined behavior (matching Java's 32-bit `int` wrap-around, and **not** equivalent to ISO C/C++ signed overflow semantics).
  - **`INT_MIN / -1` and `INT_MIN % -1`**: Guarded explicitly before CPU division — `INT_MIN / -1` fails safely with `Runtime Error at line <N>: Signed integer overflow in division` instead of trapping/crashing, while `INT_MIN % -1` evaluates safely to `0`.
  - Any mixed `int` + `float` binary operation widens cleanly to `float` (`double`).
  - Modulo (`%`) requires `int` operands and non-zero divisor.
- **Preserving `float` precision & literals in TAC**: `src/tac/tac.c` (`format_float_literal`) serializes `double` values using `DBL_DECIMAL_DIG` (`%.17g`) for binary64 round-trip accuracy and appends `.0` when no decimal point or exponent appears so whole-number floats such as `7.0` stay `VM_VAL_FLOAT`.
- **Logical operators (DEC-07)**: `TAC_OP_AND` (`&&`) and `TAC_OP_OR` (`||`) execute eagerly matching the compiler IR; `TAC_OP_NOT` (`!`) negates truthiness; `TAC_OP_IF_GOTO` branches when its condition is truthy.
- **Console output**:
  - **C (`TAC_OP_ARG` + `TAC_OP_PRINTF`)**: Evaluates and queues arguments left-to-right; supports `%d` (`int`), `%f` and precision `%.[0-20]f` (`float`, e.g., `%.8f`), `%s` (`string`), `%%`, and unescaped `\n`, `\t`, `\r`, `\\`, `\"`, `\'`, with `\0` truncating strings safely.
  - **C++ / Java (`TAC_OP_PRINT` / `TAC_OP_PRINTLN`)**: Prints integers, floats (`%g`), strings, and booleans (`true` / `false`) in order; `println` appends `\n` (and supports empty `std::endl` / `System.out.println()`). *(Note: C++ `std::cout << bool` emits `true`/`false` in the shared IR VM rather than `1`/`0`.)*

---

## 4. Runtime Safety, Step Limits & Source Line Reporting

1. **AST → TAC Source Line Tracking**: `TacInstr` stores `int line` populated during TAC generation (`gen->current_line` propagated from AST nodes). Existing `tac_print` text output remains unchanged.
2. **Pre-fault Output Flushing**: `stdout` is flushed after every output instruction and before emitting any runtime error so output produced prior to a crash remains visible.
3. **Runtime Errors (`VM_ERR_RUNTIME`)**:
   - Division by zero (`/`) and modulo by zero (`%`)
   - Reading an uninitialized variable or missing temporary
   - Invalid operand or format specifier types / `printf` argument mismatches
   - Undefined or duplicate TAC labels
   - Format: `Runtime Error at line <N>: <message>` on `stderr`, exit code `1`
4. **Infinite Loop Protection (`VM_ERR_STEP_LIMIT`)**: Execution stops cleanly once `VM_DEFAULT_MAX_STEPS` (`1,000,000`) TAC instructions are executed (configurable via `VmConfig.max_steps`), preventing hangs and freeing all VM memory cleanly.
5. **Memory Ownership**: `vm_state_destroy` frees every variable name/value, argument stack slot, label table, and VM state on both normal return and error exits.

---

## 5. CLI & IDE Integration

- **CLI**:
  - `bin/compilecraft.exe --run <source.{c,cpp,java}>`
  - Individual compiler binaries also support `--run`: `bin/compilecraft-{c,cpp,java}.exe --run <source>`
- **Desktop IDE (`frontend/`)**:
  - Clicking **Run** (`Ctrl+Enter`) compiles via `bin/compilecraft.exe` (`--tokens`, `--ast`, `--symtab`, TAC) and executes `--run` if compilation passes.
  - The **Program Output** pane displays stdout, exit status, compile + execution timing, and runtime errors while keeping **TAC** visible even when a runtime fault occurs.
  - Clicking **Stop** cancels an active run via Electron IPC (`compilecraft:stop`), terminating the child process tree cleanly.
  - Compilation failures clear stale **Program Output** and suppress VM execution completely.

---

## 6. Interactive Program Input (M16)

CompileCraft's VM (`src/vm/vm.c`) implements seven TAC input opcodes driven by `VmConfig.in` (defaulting to `stdin`), a 16-byte LIFO pushback buffer (`vm_ungetc` / `vm_unget_slice_reverse`), and flush-before-read semantics (`fflush(state->out)`):

| TAC Opcode | Behavior |
|---|---|
| `read_int <prefix\|token>` | Reads signed 32-bit integer (`prefix` mode stops before delimiters for C `scanf` / C++ `cin`; `token` mode validates complete whitespace-delimited token for Java `nextInt`). |
| `read_float <prefix\|token>` | Reads binary64 float (`prefix` mode preserves invalid exponent tails via reverse-order pushback; `token` mode validates complete token for Java `nextFloat`). |
| `read_bool <cpp\|java>` | `cpp` accepts `0` / `1` only; `java` accepts case-insensitive `true` / `false`. |
| `read_str [cap]` | Reads whitespace-delimited token up to optional capacity `cap` (leaving unread remainder in stream for bounded `%s` / `%Ns`). |
| `read_line` | Reads until `\n` or EOF without skipping leading spaces, strips trailing `\r`, and allows empty lines (`""`). |
| `scan_ws` | Skips optional leading whitespace and pushes back first non-whitespace byte. |
| `scan_lit "<text>"` | Matches exact literal characters from `scanf` format strings (and skips embedded whitespace cleanly). |

In the **Electron IDE**, `--run` spawns as a persistent child process (`shell: false`) with piped `stdin`, live `stdout`/`stderr` streaming, an inline console input bar (`Enter` to submit, `Send EOF`, `Stop`), `runId` isolation, and a 2 MB cumulative stdout+stderr byte cap.

---

## 7. Verification

| Suite | Command | Coverage |
|---|---|---|
| VM unit suite (`tests/vm/test_vm.c`) | `mingw32-make test-vm-unit` | Arithmetic, unary, relational/logical, branches, loops, `TAC_OP_ITOF`, `TAC_OP_UNINIT`, `printf`/`%.Nf`/`print`/`println`, div/mod by zero, overflow boundary cases, uninitialized read, step limit (`bin/test-vm.exe`). |
| Multi-language execution (`tests/vm/test_vm_execution.py`) | `mingw32-make test-vm-exec` | C, C++, Java valid demos, shadowing/scope isolation, self-shadowing initializers, long identifiers, loop uninit resets, `int->float` conversion, `DBL_DECIMAL_DIG`/`%.8f` float precision, signed overflow/`INT_MIN`, div/mod-by-zero partial output + line numbers, uninitialized read, infinite loop step limit, compile error gating (`35/35`). |
| Unified CLI `--run` (`tests/cli/test_cli.py`) | `mingw32-make test-cli` | `--run` flag help, conflict checks, C/C++/Java execution (`56/56`). |
