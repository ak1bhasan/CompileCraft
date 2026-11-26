#!/usr/bin/env python3
"""
CompileCraft - Automated Unified CLI Test Suite (Milestone 8)
Verifies bin/compilecraft.exe across .c, .cpp, and .java:
- Help and CLI argument error handling
- Language dispatch & TAC generation for C, C++, and Java
- --ast forwarding across C, C++, and Java
- All 6 faculty semantic rules, lexical errors, and syntax errors (zero TAC)
- Missing files and unsupported extensions (including .mc rejection in CLI)
- Paths with spaces and execution from outside the repository root
"""

import os
import shutil
import subprocess
import sys
import tempfile


def run_cli(cli_bin, args, cwd=None):
    proc = subprocess.run(
        [cli_bin] + args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=cwd,
    )
    return proc.returncode, proc.stdout.replace("\r\n", "\n"), proc.stderr.replace("\r\n", "\n")


def contains_tac(text):
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith(("t1 =", "L1:", "if ", "goto ", "print ")):
            return True
    return False


def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    cli_bin = os.path.abspath(
        sys.argv[1] if len(sys.argv) > 1 else os.path.join(repo_root, "bin", "compilecraft.exe")
    )

    if not os.path.isfile(cli_bin):
        print(f"Error: Unified CLI binary not found at '{cli_bin}'")
        return 1

    tests = []

    def check(name, cond, detail=""):
        tests.append((name, bool(cond), detail))

    # 1. --help / -h lists .c, .cpp, .java only
    for flag in ("--help", "-h"):
        rc, out, err = run_cli(cli_bin, [flag])
        check(
            f"cli_{flag}",
            rc == 0 and ".c" in out and ".cpp" in out and ".java" in out and ".mc" not in out and err == "",
            f"rc={rc} out={out!r} err={err!r}",
        )

    # 2. Invalid CLI invocations
    rc, out, err = run_cli(cli_bin, [])
    check("cli_no_args", rc == 1 and "Usage:" in err, f"rc={rc} err={err!r}")

    rc, out, err = run_cli(cli_bin, ["--unknown-flag", "tests/cli/valid_c.c"])
    check("cli_unknown_flag", rc == 1 and "Unknown option" in err, f"rc={rc} err={err!r}")

    rc, out, err = run_cli(cli_bin, ["tests/cli/valid_c.c", "tests/cli/valid_cpp.cpp"])
    check("cli_multiple_files", rc == 1 and "Multiple source files" in err, f"rc={rc} err={err!r}")

    # 3. Missing file and unsupported extensions (including .mc)
    rc, out, err = run_cli(cli_bin, ["tests/cli/nonexistent_program.cpp"])
    check(
        "cli_missing_file",
        rc == 1 and "Cannot open source file" in err and not contains_tac(out),
        f"rc={rc} err={err!r}",
    )

    rc, out, err = run_cli(cli_bin, ["tests/cli/unsupported.txt"])
    check(
        "cli_unsupported_ext_txt",
        rc == 1 and "Unsupported file extension" in err and not contains_tac(out),
        f"rc={rc} err={err!r}",
    )

    rc, out, err = run_cli(cli_bin, ["tests/tac/golden/12_sample_program.mc"], cwd=repo_root)
    check(
        "cli_rejects_mc_ext",
        rc == 1 and "Unsupported file extension" in err and not contains_tac(out),
        f"rc={rc} err={err!r}",
    )

    rc, out, err = run_cli(cli_bin, ["tests/cli/no_extension_name"])
    check(
        "cli_missing_ext",
        rc == 1 and "Missing file extension" in err and not contains_tac(out),
        f"rc={rc} err={err!r}",
    )

    # 4. Valid end-to-end TAC across C, C++, and Java
    valid_specs = [
        ("valid_c.c", ["active = true", "total = 0", "if ", "goto "], os.path.join(repo_root, "tests/cli/valid_c.c")),
        ("valid_cpp.cpp", ["active = true", "total = 0", "if ", "goto "], os.path.join(repo_root, "tests/cli/valid_cpp.cpp")),
        ("ValidJava.java", ["active = true", "total = 0", "if ", "goto "], os.path.join(repo_root, "tests/cli/ValidJava.java")),
        ("space_path.c", ["a = 2", "t1 = 3 * 4", "t2 = a + t1", "b = t2"], os.path.join(repo_root, "tests/cli/space path/program with spaces.c")),
    ]
    for label, expected_snippets, src in valid_specs:
        rc, out, err = run_cli(cli_bin, [src])
        ok = (rc == 0) and (err.strip() == "") and all(snip in out for snip in expected_snippets)
        check(f"tac_{label}", ok, f"rc={rc} out={out!r} err={err!r}")

    # 5. --tokens, --ast, and --symtab dispatch across C, C++, and Java
    for label, src, marker in [
        ("tokens_c", "tests/cli/valid_c.c", "KW_BOOL"),
        ("tokens_cpp", "tests/cli/valid_cpp.cpp", "KW_BOOL"),
        ("tokens_java", "tests/cli/ValidJava.java", "KW_BOOLEAN"),
    ]:
        rc, out, err = run_cli(cli_bin, ["--tokens", src], cwd=repo_root)
        check(label, rc == 0 and marker in out and not contains_tac(out), f"rc={rc} out={out!r} err={err!r}")

    for label, src, marker in [
        ("ast_c", "tests/cli/valid_c.c", "VarDecl bool"),
        ("ast_cpp", "tests/cli/valid_cpp.cpp", "VarDecl bool"),
        ("ast_java", "tests/cli/ValidJava.java", "VarDecl bool"),
    ]:
        rc, out, err = run_cli(cli_bin, ["--ast", src], cwd=repo_root)
        check(label, rc == 0 and marker in out and not contains_tac(out), f"rc={rc} out={out!r} err={err!r}")

    for label, src, expected_syms in [
        ("symtab_c", "tests/cli/valid_c.c", ["active type=bool scope=0", "i type=int scope=1"]),
        ("symtab_cpp", "tests/cli/valid_cpp.cpp", ["active type=bool scope=0", "i type=int scope=1"]),
        ("symtab_java", "tests/cli/ValidJava.java", ["active type=bool scope=0", "i type=int scope=1"]),
    ]:
        rc, out, err = run_cli(cli_bin, ["--symtab", src], cwd=repo_root)
        check(
            label,
            rc == 0 and err.strip() == "" and all(s in out for s in expected_syms) and not contains_tac(out),
            f"rc={rc} out={out!r} err={err!r}",
        )

    # 6. Six semantic error categories + lexical + syntax errors across C, C++, Java (zero TAC emitted)
    error_specs = [
        ("sem_rule1_c", "tests/cli/sem_rule1_undeclared.c", "Semantic Error at line 2:"),
        ("sem_rule2_c", "tests/cli/sem_rule2_redeclare.c", "Semantic Error at line 3:"),
        ("sem_rule3_cpp", "tests/cli/sem_rule3_scope.cpp", "Semantic Error at line 5:"),
        ("sem_rule4_c", "tests/cli/sem_rule4_type_mismatch.c", "Semantic Error at line 2:"),
        ("sem_rule5_java", "tests/cli/sem_rule5_invalid_assignment.java", "Semantic Error at line 5:"),
        ("sem_rule6_cpp", "tests/cli/sem_rule6_invalid_expr.cpp", "Semantic Error at line 3:"),
        ("lex_java", "tests/cli/lex_error_invalid_char.java", "Lexical Error at line 3:"),
        ("lex_preproc_c", "tests/cli/lex_error_preproc.c", "Lexical Error at line 1:"),
        ("syn_cpp", "tests/cli/syn_error_semicolon.cpp", "Syntax Error at line 3:"),
        ("syn_java", "tests/cli/syn_error_class.java", "Syntax Error at line 1:"),
    ]
    for label, rel_path, expected_err in error_specs:
        rc, out, err = run_cli(cli_bin, [rel_path], cwd=repo_root)
        ok = (rc == 1) and (expected_err in err) and (out.strip() == "")
        check(f"err_{label}", ok, f"rc={rc} out={out!r} err={err!r}")

    # 7. Run from outside the repository root + path with spaces
    with tempfile.TemporaryDirectory(prefix="cc external dir ") as ext_dir:
        ext_src = os.path.join(ext_dir, "External Main.java")
        shutil.copyfile(os.path.join(repo_root, "tests/cli/ValidJava.java"), ext_src)
        rc, out, err = run_cli(cli_bin, ["External Main.java"], cwd=ext_dir)
        ok = (rc == 0) and ("active = true" in out) and ("t3 = active && t2" in out) and (err.strip() == "")
        check("external_cwd_with_spaces", ok, f"rc={rc} out={out!r} err={err!r}")

    passed = sum(1 for _, ok, _ in tests if ok)
    failed = len(tests) - passed

    print("==============================================================================")
    print(" CompileCraft - Unified CLI Test Suite (Milestone 8)")
    print("==============================================================================")
    print(f" Target Executable : {cli_bin}")
    print(f" Total Test Cases  : {len(tests)}")
    print("==============================================================================")
    for name, ok, detail in tests:
        tag = "[PASS]" if ok else "[FAIL]"
        print(f"  {tag} {name:<35}")
        if not ok:
            print(f"         {detail}")
    print("==============================================================================")
    print(f" Test Summary: {passed} passed, {failed} failed out of {len(tests)} tests.")
    print("==============================================================================")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
