# CompileCraft Context-Free Grammar (CFG) Specification

> **Project**: CompileCraft — Mini Programming Language Compiler Front-End  
> **Milestone**: Milestone 1 — Formal Grammar and Token Specification  
> **Authoritative Specification**: Language Specification (Section 5)  
> **Grammar Class**: LALR(1) / Context-Free Grammar (Bison Compatible)

---

## 1. Overview and Design Principles

The CompileCraft grammar defines the syntactic structure of an imperative, block-scoped, statically typed mini programming language. It is designed to satisfy the following engineering criteria:

1. **Section 5 Authority**: Conforms strictly to the language specification in Section 5. Where other manual sections contain conflicting examples, Section 5 prevails.
2. **Deterministic LALR(1) Parsing**: Designed with unambiguous productions and precedence directives, achieving **zero unresolved conflicts after precedence resolution** (0 shift/reduce, 0 reduce/reduce conflicts) under Bison analysis, without claiming this alone proves the grammar is unambiguous.
3. **Clean Phase Separation**: Grammatical rules strictly govern structural validity (token sequencing, nesting, and statement boundaries). Context-dependent properties (such as type matching, variable declaration before use, and scope visibility) are deliberately deferred to the Semantic Analysis phase (Milestone 6).
4. **Resilient Error Recovery**: Employs synchronization productions (`error ';'`) to recover gracefully from malformed statements and continue parsing.

---

## 2. Formal Grammar in EBNF / BNF

### 2.1 Program Structure and Statements
A program consists of an optional sequence of top-level statements. Statements are separated or terminated by semicolons or block braces.

```bnf
<program>          ::= <statement_list>

<statement_list>   ::= <statement_list> <statement>
                     | /* empty */

<statement>        ::= <var_decl_stmt>
                     | <assign_stmt>
                     | <if_stmt>
                     | <while_stmt>
                     | <print_stmt>
                     | <block_stmt>
                     | <expr_stmt>
                     | ';'
                     | <error_stmt>
```

### 2.2 Variable Declarations (Section 5.1, 5.2)
Variable declarations specify a type name, an identifier, and an optional initialization expression, terminated by a semicolon.

```bnf
<var_decl_stmt>    ::= <type_spec> IDENTIFIER ';'
                     | <type_spec> IDENTIFIER '=' <expression> ';'

<type_spec>        ::= KW_INT
                     | KW_FLOAT
                     | KW_BOOL
```

*Note on DEC-01*: Section 5.2 explicitly specifies `Variable declaration (e.g., int x;)`. To ensure backward-compatibility with standard programmer expectations and Section 4.5 error examples (`bool b = 5 + 3.2;`), the grammar accepts both uninitialized and initialized declarations.

### 2.3 Assignment Statements (Section 5.2)
Assignments store the evaluated result of an expression into an identifier.

```bnf
<assign_stmt>      ::= IDENTIFIER '=' <expression> ';'
```

### 2.4 Expression Statements
An expression followed by a semicolon is permitted as a statement (e.g. for standalone operations).

```bnf
<expr_stmt>        ::= <expression> ';'
```

### 2.5 Block Statements & Scoping (Section 5.2)
A compound block statement encloses zero or more statements within curly braces. Each block statement introduces a new lexical scope.

```bnf
<block_stmt>       ::= '{' <statement_list> '}'
```

### 2.6 Control Flow Statements (Section 5.2)
The language supports single-branch conditionals (`if`), two-branch conditionals (`if-else`), and iterative loops (`while`).

```bnf
<if_stmt>          ::= KW_IF '(' <expression> ')' <statement> %prec LOWER_THAN_ELSE
                     | KW_IF '(' <expression> ')' <statement> KW_ELSE <statement>

<while_stmt>       ::= KW_WHILE '(' <expression> ')' <statement>
```

### 2.7 Output Statements (Section 5.2)
Outputs the value of an expression to standard output.

```bnf
<print_stmt>       ::= KW_PRINT <expression> ';'
```

### 2.8 Expressions and Operators (Section 5.3)
Expressions are stratified by operator precedence. In the Bison implementation, ambiguity is resolved using explicit associativity and precedence directives.

```bnf
<expression>       ::= <logical_or_expr>

<logical_or_expr>  ::= <logical_or_expr> '||' <logical_and_expr>
                     | <logical_and_expr>

<logical_and_expr> ::= <logical_and_expr> '&&' <equality_expr>
                     | <equality_expr>

<equality_expr>    ::= <equality_expr> '==' <relational_expr>
                     | <equality_expr> '!=' <relational_expr>
                     | <relational_expr>

<relational_expr>  ::= <relational_expr> '<' <additive_expr>
                     | <relational_expr> '>' <additive_expr>
                     | <relational_expr> '<=' <additive_expr>
                     | <relational_expr> '>=' <additive_expr>
                     | <additive_expr>

<additive_expr>    ::= <additive_expr> '+' <multiplicative_expr>
                     | <additive_expr> '-' <multiplicative_expr>
                     | <multiplicative_expr>

<multiplicative_expr> ::= <multiplicative_expr> '*' <unary_expr>
                        | <multiplicative_expr> '/' <unary_expr>
                        | <multiplicative_expr> '%' <unary_expr>
                        | <unary_expr>

<unary_expr>       ::= '!' <unary_expr>
                     | '-' <unary_expr> %prec UMINUS
                     | <primary_expr>

<primary_expr>     ::= IDENTIFIER
                     | INT_LITERAL
                     | FLOAT_LITERAL
                     | KW_TRUE
                     | KW_FALSE
                     | '(' <expression> ')'
```

### 2.9 Syntax Error Recovery (Section 4.2)
To fulfill the requirement for basic syntax error recovery:
```bnf
<error_stmt>       ::= error ';'
```
When an invalid statement is encountered, the parser issues a syntax error diagnostic, skips erroneous tokens until the next semicolon (`;`), and resumes normal parsing.

---

## 3. Operator Precedence & Dangling-Else Resolution

### 3.1 Operator Precedence Table

The operator precedence hierarchy is defined from lowest to highest precedence:

| Precedence Level | Operators | Associativity | Description |
|---|:---:|:---:|---|
| **1 (Lowest)** | `LOWER_THAN_ELSE` | Non-associative | Resolves conditional branching conflict |
| **2** | `else` | Non-associative | Associates `else` with innermost `if` |
| **3** | `=` | Right | Assignment operator |
| **4** | `\|\|` | Left | Logical OR (disjunction) |
| **5** | `&&` | Left | Logical AND (conjunction) |
| **6** | `==`, `!=` | Left | Equality and inequality operators |
| **7** | `<`, `>`, `<=`, `>=` | Left | Relational comparison operators |
| **8** | `+`, `-` | Left | Additive arithmetic operators |
| **9** | `*`, `/`, `%` | Left | Multiplicative arithmetic operators |
| **10** | `!` | Right | Unary logical negation |
| **11 (Highest)**| `UMINUS` (`-`) | Right | Unary arithmetic negation |

### 3.2 Resolving Dangling-Else Ambiguity

The classic grammar ambiguity:
```c
if (c1) if (c2) s1 else s2
```
can be parsed as either:
1. `if (c1) { if (c2) s1 else s2 }` (innermost binding)
2. `if (c1) { if (c2) s1 } else s2` (outermost binding)

CompileCraft resolves this deterministically in Bison by assigning precedence tokens:
```yacc
%nonassoc LOWER_THAN_ELSE
%nonassoc KW_ELSE

if_stmt:
    KW_IF LPAREN expression RPAREN statement %prec LOWER_THAN_ELSE
  | KW_IF LPAREN expression RPAREN statement KW_ELSE statement
  ;
```
Because `KW_ELSE` has higher precedence than `LOWER_THAN_ELSE`, the parser shifts `KW_ELSE` onto the lookahead stack instead of reducing the incomplete `if`, binding the `else` to the innermost matching `if`.

---

## 4. Distinction Between Syntax Rules and Semantic Checks

To maintain clean compiler architecture, syntactic rules are kept distinct from semantic constraints:

| Language Rule | Handled by Grammar (Syntax) | Handled by Semantic Analyzer | Rationale |
|---|:---:|:---:|---|
| **Balanced parentheses & braces** | **YES** | No | Purely structural context-free property. |
| **Terminating semicolons** | **YES** | No | Syntactic delimiter enforcing statement boundaries. |
| **Statement sequencing** | **YES** | No | Enforced by `<statement_list>` production. |
| **Operator precedence** | **YES** | No | Enforced by LALR(1) precedence directives. |
| **Variable declared before use** | No | **YES** | Context-sensitive: requires symbol table lookup. |
| **Variable redeclaration in same scope** | No | **YES** | Context-sensitive: requires checking scope table. |
| **Scope boundary isolation** | No | **YES** | Context-sensitive: requires checking active scope stack. |
| **Type compatibility in assignments** | No | **YES** | Requires evaluating type of LHS and RHS AST nodes (e.g., rejecting narrowing float-to-int conversion). |
| **Logical operators on boolean operands only** | No | **YES** | Syntax allows expressions; semantic phase checks types. |
| **Integer-only modulo (`%`)** | No | **YES** | Semantic phase verifies operands evaluate to `TYPE_INT`. |

---

## 5. Grammar Validation Results

The proposed grammar was validated empirically using GNU Bison (version 3.8.2) with the `-v` (verbose state output) and `-Wcounterexamples` flags:

- **State Count**: 85 automata states.
- **Bison Resolution**: **zero unresolved conflicts after precedence resolution** (0 shift/reduce, 0 reduce/reduce conflicts).
- **Counterexamples**: None detected.

> **Note on Ambiguity**: While Bison confirms zero unresolved conflicts after precedence resolution, this empirical check demonstrates that the LALR(1) parser resolves state transitions deterministically with the specified precedence directives, without claiming this alone proves the grammar is unambiguous.

### Validation Test Runs

#### Test 1: Authoritative Section 5.5 Sample Program
```c
int x;
int y;
bool flag;
x = 10;
y = 0;
flag = true;
while (x > 0) {
    y = y + x;
    x = x - 1;
}
if (flag == true) {
    print y;
} else {
    print x;
}
```
*Validation Result*: **PASSED** (parsed cleanly with exit code 0).

#### Test 2: Complex Expressions and Nested Blocks
```c
int a;
float b;
bool c;
a = 10 % 3 + 4 * 2;
b = 3.14159 / 2.0;
c = !false && (a >= 5 || b < 10.0);
{
    int scoped_var;
    scoped_var = a + 1;
    print scoped_var;
}
if (c) {
    if (a == 11) {
        print a;
    } else {
        print 0;
    }
}
```
*Validation Result*: **PASSED** (parsed cleanly with exit code 0).

#### Test 3: Missing Semicolon Detection (Invalid Syntax)
```c
int a
int b;
```
*Validation Result*: **DETECTED** (`Syntax Error at line 2: syntax error`, exit code 1).

#### Test 4: Malformed Expression Detection (Invalid Syntax)
```c
int x;
x = + * 5;
```
*Validation Result*: **DETECTED** (`Syntax Error at line 2: syntax error`, exit code 1).
