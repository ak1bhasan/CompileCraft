# Architectural Decisions & Open Language Questions

> **Project**: CompileCraft — Mini Programming Language Compiler Front-End  
> **Rule of Precedence**: In accordance with the specification guidelines, **Section 5 is authoritative** and supersedes any ambiguity or conflicting examples elsewhere in the manual.  
> **Note**: Items below clearly separate **manual-supported conclusions** from **open questions with proposed engineering defaults**.

---

## 1. Specification Matrix & Analysis

| ID | Topic | Manual References | Manual-Supported Conclusion vs Open Question | Working Engineering Default | Status |
|---|---|---|---|---|:---:|
| **DEC-01** | Variable Initialization in Declaration | Sec 5.2, 5.5 vs Sec 4.5 | **Ambiguity**: Sec 5.2 specifies `Variable declaration (e.g., int x;)` and `Assignment (e.g., x = 5;)` as separate statements. Sec 5.5 sample program uses strictly separate statements. However, Sec 4.5 table shows `bool b = 5 + 3.2;`. | Support both `type ID;` and optional `type ID = expr;` in grammar to allow flexibility while remaining strictly compatible with Sec 5.5 programs. | **OPEN** |
| **DEC-02** | Type Widening vs Strict Equivalence | Sec 4.5, 5.1 | **Ambiguity**: Sec 4.5 forbids `bool` with numeric types (`bool = int + float` is a type mismatch). It does not define implicit type promotion between `int` and `float` (e.g. `1 + 2.5`). No casting syntax is specified in Section 5. | Strict type checking by default. Disallow implicit narrowing (float-to-int conversion: `int = float`). For mixed arithmetic (`int + float`), allow widening (int-to-float conversion) if widening is accepted; otherwise flag as type mismatch. | **OPEN** |
| **DEC-03** | Modulo Operator Domain | Sec 5.3 | **Supported Conclusion**: `%` is listed under arithmetic operators. Standard compiler semantics restrict modulo to integer types (`int % int -> int`). Float modulo is not defined. | Restrict `%` strictly to integer operands. Flag floating-point modulo (`float % ...`) as a semantic error. | **SUPPORTED** |
| **DEC-04** | Equality Operators on Booleans | Sec 5.3, 5.5 | **Supported Conclusion**: Sec 5.5 explicitly includes `if (flag == true)`. Equality operators (`==`, `!=`) therefore legally apply to boolean operands (`bool == bool`). | Allow `==` and `!=` on `bool`. Restrict ordering operators (`<`, `>`, `<=`, `>=`) strictly to numeric types (`int`, `float`). | **SUPPORTED** |
| **DEC-05** | Control Flow Statement Bodies & Braces | Sec 5.2, 5.5 | **Supported Conclusion**: Sec 5.2 lists "Nested blocks ({ ... }), with proper scoping". Sec 5.5 encloses all `while` and `if-else` bodies in `{ ... }`. | Grammar rules allow both single statements and compound blocks `{ ... }`, with new lexical scope frames generated exclusively on `{ ... }` blocks. | **SUPPORTED** |
| **DEC-06** | `print` Statement Argument Expression | Sec 4.6, 5.2, 5.5 | **Supported Conclusion**: Sec 5.5 uses `print y;` (an identifier). Sec 4.6 lists `print a`. Generalizing to expressions (`print expr;`) is backwards-compatible with identifier printing. | Define grammar rule as `print <expr>;`. In TAC generation, evaluate expression into an operand and emit `print <operand>`. | **SUPPORTED** |
| **DEC-07** | Short-Circuit Evaluation in TAC Generation | Sec 4.6, 5.3 | **Ambiguity**: Section 4.6 requires generating TAC for relational/logical expressions and control flow using labels and conditional jumps, but does not mandate short-circuit vs eager boolean evaluation. | For control flow conditions (`if`, `while`), generate short-circuit jumping labels. For boolean expressions assigned to variables (`b = x > 0 && y > 0;`), evaluate into temporary boolean registers. | **OPEN** |
| **DEC-08** | Comment Delimiters | Sec 4.1 | **Supported Conclusion**: Sec 4.1 mandates discarding single-line and/or block comments without producing tokens. Standard C syntax (`//` and `/* ... */`) applies. | Implement Flex patterns for `// ...` (to end of line) and `/* ... */` (multiline). | **SUPPORTED** |
| **DEC-09** | Multi-Variable Declarations | Sec 4.6, 5.2, 5.5 | **Supported Conclusion**: All declarations in Sec 4.6 and Sec 5.5 declare a single variable per statement (`int a; int b; int c;`). | Support single declaration per statement (`type ID;`) strictly adhering to Section 5.2. | **SUPPORTED** |
| **DEC-10** | Error Recovery Strategy & CLI Exit Code | Sec 4.2, 4.5 | **Supported Conclusion**: Sec 4.2 requires basic error recovery via Bison `error` token to continue parsing. Sec 4.5 requires detecting all semantic violations. | Continue parsing and semantic analysis to collect and report all diagnostic errors; exit with code 0 on clean build, non-zero (code 1) if errors are detected. | **SUPPORTED** |
| **DEC-11** | Compilation Pipeline Boundary | Sec 4.6, 6 | **Supported Conclusion**: Sec 4.6 and Sec 6 explicitly mandate terminating at Three-Address Code (TAC). Assembly, machine code, register allocation, and linking are strictly out of scope. | The compiler pipeline terminates at Three-Address Code (TAC) generation. | **SUPPORTED** |
| **DEC-12** | Unary Minus Handling | Sec 5.3 vs Sec 14 | **Ambiguity**: Sec 5.3 lists `-` under arithmetic operators, while Sec 14 lists "Unary operators, increment/decrement" as bonus features. However, expressions like `x = -1;` or `-a` are common. | In the grammar, support unary minus (`- <expr> %prec UMINUS`) while excluding full unary extensions (increment/decrement `++`, `--`). Literals in the lexer remain unsigned (`[0-9]+`). | **PROPOSED** |
| **DEC-13** | Multi-Language Front-Ends (C, C++, Java) | Project Scope Clarification | **Scope Clarification**: CompileCraft must support separate compiler front ends for C, C++, and Java targeting a shared Three-Address Code (TAC) intermediate representation. | Define realistic, principled subsets for C, C++, and Java. Re-architect the front ends into dedicated language directories (`C_Compiler/`, `CPP_Compiler/`, `Java_Compiler/`) sharing core symbol table, AST infrastructure, and TAC code generation. | **SUPPORTED** |

---

## 2. Detailed Technical Review of Key Decisions

### DEC-01: Variable Initialization in Declarations
- **Manual Evidence**:
  - Section 5.2 (authoritative) states:
    > "Statements Supported: Variable declaration (e.g., int x;), Assignment (e.g., x = 5;)"
  - Section 5.5 (sample program):
    ```c
    int x;
    int y;
    bool flag;
    x = 10;
    y = 0;
    flag = true;
    ```
  - Section 4.5 (semantic error table example):
    > "Type mismatch: bool b = 5 + 3.2;"
- **Analysis**:
  Section 5 defines declarations and assignments as distinct statements. However, standard programmer ergonomics frequently utilize combined declaration and initialization (`int x = 10;`). Section 4.5 uses `bool b = 5 + 3.2;` to illustrate a type mismatch error.
- **Proposed Default for CompileCraft**:
  The parser grammar will accept both forms:
  ```bnf
  var_decl ::= TYPE IDENTIFIER ';'
             | TYPE IDENTIFIER '=' expr ';'
  ```
  This guarantees full compatibility with Section 5.5 sample programs while also handling initialization statements cleanly.

---

### DEC-02: Numeric Type Compatibility (Implicit Widening vs Strict Equivalence)
- **Manual Evidence**:
  - Section 5.1 defines three data types: `int`, `float`, and `bool`.
  - Section 4.5 error table explicitly lists:
    - Undeclared variable use
    - Redeclaration in same scope
    - Scope violation
    - Type mismatch: `bool b = 5 + 3.2;`
    - Invalid assignment: Assigning a bool expression to an int variable, or similar
    - Invalid expressions: Applying logical operators to numeric operands
- **Analysis**:
  The manual explicitly isolates `bool` from numeric types. However, it does not explicitly state whether `int` implicitly promotes to `float` in mixed arithmetic (e.g., `10 + 3.14`), or whether assigning an `int` to a `float` (`float f; f = 10;`) is legal. Explicit type-casting syntax is not defined anywhere in Section 5.
- **Proposed Default for CompileCraft**:
  1. `bool` is completely incompatible with numeric types (no conversion or comparison with `int`/`float`).
  2. Float-to-int conversion is described as narrowing (`int = float`), which is strictly forbidden and rejected as an Invalid Assignment error.
  3. Int-to-float conversion is described as widening (`float = int` or `int + float -> float`), which is treated as lossless widening promotion in mixed arithmetic and assignment unless strict type equivalence is explicitly enforced.

---

### DEC-04: Equality Operators on Booleans
- **Manual Evidence**:
  - Section 5.3 lists relational operators: `< > <= >= == !=`.
  - Section 5.5 sample program contains:
    ```c
    if (flag == true) {
        print y;
    }
    ```
- **Supported Conclusion**:
  Section 5.5 formally proves that `==` (and symmetrically `!=`) is valid for boolean operands.
- **Working Engineering Specification**:
  - Equality operators (`==`, `!=`): Accept operands of matching types (`int` with `int`, `float` with `float`, or `bool` with `bool`). Comparing `bool == int` is reported as a type mismatch.
  - Ordering operators (`<`, `>`, `<=`, `>=`): Strictly require numeric operands (`int`, `float`). Applying ordering operators to boolean values is reported as a semantic error.

---

### DEC-06: Syntax and Behavior of `print`
- **Manual Evidence**:
  - Section 5.2 lists "print statement".
  - Section 5.5 uses:
    ```c
    print y;
    print x;
    ```
  - Section 4.6 gives the example: `print a`.
- **Supported Conclusion**:
  The language uses a statement keyword `print` followed by an operand and a terminating semicolon `;`.
- **Proposed Default for CompileCraft**:
  Allow general expressions: `print <expr>;`. In AST representation, `PrintNode` holds an expression subtree. For simple identifiers, it directly emits `print ID`. For compound expressions, TAC generation evaluates the expression into a temporary register first (`t1 = x + y; print t1`).

---

### DEC-07: Intermediate Three-Address Code (TAC) Format
- **Manual Evidence**:
  - Section 4.6 illustrates TAC as:
    ```
    a = 5
    b = 10
    t1 = b * 2
    t2 = a + t1
    c = t2
    ```
  - Section 4.6 requires handling:
    - Arithmetic expressions (precedence preserved)
    - Relational and logical expressions
    - Control flow (if, if-else, while) using labels and jumps
    - Print statements
- **Supported Conclusion**:
  TAC instructions must have at most three operands. Conditionals utilize synthetic jump labels (`L1`, `L2`) and conditional branching instructions (`if <cond> goto <label>`, `goto <label>`).
- **Proposed Default for CompileCraft**:
  - Sequential temporary naming: `t1`, `t2`, `t3`, ...
  - Sequential label naming: `L1`, `L2`, `L3`, ...
  - Clear linear text emission format matching the Section 4.6 specification.

---

### DEC-12: Unary Minus vs Negative Literals
- **Manual Evidence**:
  - Section 5.3 lists `-` under arithmetic operators.
  - Section 14 lists "Unary operators, increment/decrement" under optional bonus features.
- **Analysis**:
  If negative literals (e.g. `-10`) are tokenized as negative numbers by the lexer, expressions like `x-5` or `x - 5` introduce lexical ambiguity between subtraction and signed integers. Standard compiler design tokenizes unsigned numbers and parses `-` as either binary subtraction or unary negation based on grammar context.
- **Proposed Default for CompileCraft**:
  The lexer tokenizes non-negative integer and floating-point literals. The grammar supports unary minus (`- <expr>`) with high precedence (`%prec UMINUS`). Increment/decrement (`++`, `--`) is deferred to Milestone 10 bonus features.

---

### DEC-13: Multi-Language Front-End Architecture (C, C++, and Java)
- **Scope Clarification**:
  CompileCraft supports three separate compiler front ends: C, C++, and Java. Each language front end tokenizes and parses its respective source syntax, constructs an AST, and maps it into a shared intermediate Three-Address Code (TAC) representation.
- **Language Subsets Definition**:
  1. **C Subset (`CompileCraft-C` / `C_Compiler/`)**:
     - *Target Standard*: ISO C99 / C11 procedural subset.
     - *Keywords*: `int`, `float`, `double`, `char`, `void`, `if`, `else`, `while`, `for`, `return`, `break`, `continue`.
     - *Identifiers*: Standard alphanumeric/underscore names (`[a-zA-Z_][a-zA-Z0-9_]*`). Note: `main` and `printf` are standard function identifiers (`IDENTIFIER`), not keywords.
     - *Functions*: Global function definitions and invocations with typed parameters and return statements.
     - *Statements*: Variable declarations with optional initializers, assignments, compound blocks `{ ... }`, `if`/`if-else`, `while`, `for`, `return`, `break`, `continue`.
     - *Preprocessing Directives Policy*: Preprocessing directives (such as `#include`, `#define`) are unsupported language features in this front end. Instead of being silently ignored, any preprocessing directive is explicitly diagnosed as a lexical error (`Unsupported language feature: Preprocessing directive`), preserving a clear distinction between valid-but-unsupported C features and malformed input.
     - *Exclusions*: Preprocessor macros, complex structs/unions, pointer arithmetic, bitfields, variable-length arrays.
  2. **C++ Subset (`CompileCraft-CPP` / `CPP_Compiler/`)**:
     - *Paradigm*: Procedural + Object-Oriented.
     - *Keywords*: C subset keywords plus `class`, `public`, `private`, `protected`, `bool`, `true`, `false`, `new`, `delete`, `this`. Note: `std`, `cout`, `cin`, and `endl` are standard identifiers (`IDENTIFIER`), not keywords.
     - *Classes & Objects*: `class Name { public: private: protected: ... };`, object instantiation via `new`, destruction via `delete`, member access `obj.field`, pointer access `ptr->method()`, scope resolution `Scope::Name`.
     - *I/O*: Stream insertion operator: `cout << expr;` and extraction `cin >> var;`.
     - *Exclusions*: Templates, multiple inheritance, operator overloading, virtual tables/dynamic dispatch, exceptions, STL containers.
  3. **Java Subset (`CompileCraft-Java` / `Java_Compiler/`)**:
     - *Paradigm*: Strictly class-enclosed object-oriented.
     - *Structure*: `public class Main { public static void main(String[] args) { ... } }`.
     - *Keywords*: `class`, `public`, `static`, `void`, `boolean`, `int`, `float`, `char`, `if`, `else`, `while`, `for`, `return`, `new`, `this`, `true`, `false`. Note: `System`, `out`, `println`, and `String` are class, field, and method identifiers (`IDENTIFIER`), not keywords.
     - *Classes & Objects*: Class declarations, `new` instantiation, `this`, field/method access via dot `.`.
     - *I/O*: Method invocation: `System.out.println(expr);`.
     - *Exclusions*: Interfaces, packages/imports, `try-catch` exceptions, generics (`List<T>`), JVM bytecode emission (Java compiles directly to TAC).
- **Reusable Core Components Across Front Ends**:
  - Comment handling (`//`, `/* ... */`), line tracking (`yylineno`), and unsigned numeric literal rules.
  - Three-Address Code (TAC) intermediate representation data structures, label/temporary allocators, and linear emitter (`src/common/tac/` [Planned]).
  - Core scoped symbol table and scope hierarchy (`src/common/symbol_table/` [Planned]).
  - Common AST nodes and pretty-printer (`src/common/ast/` [Planned]).
  - Test runner infrastructure (`tests/run_tests.py`).
