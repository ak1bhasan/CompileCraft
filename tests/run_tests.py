#!/usr/bin/env python3
"""
CompileCraft - Automated Lexer Test Suite Runner
Executes lexical analyzer tests and validates token streams, error diagnostics, and exit codes.
"""

import os
import sys
import subprocess
import difflib

def main():
    if len(sys.argv) > 1:
        lexer_bin = sys.argv[1]
    else:
        lexer_bin = os.path.join("bin", "compilecraft-lexer.exe")

    if not os.path.isfile(lexer_bin):
        print(f"Error: Lexer executable not found at '{lexer_bin}'. Run 'mingw32-make lexer' first.")
        sys.exit(1)

    if len(sys.argv) > 2:
        tests_dir = sys.argv[2]
    else:
        tests_dir = os.path.join("tests", "lexer")

    if not os.path.isdir(tests_dir):
        print(f"Error: Tests directory not found at '{tests_dir}'.")
        sys.exit(1)

    test_files = sorted([f for f in os.listdir(tests_dir) if f.endswith(".mc") or f.endswith(".c")])
    if not test_files:
        print(f"Warning: No .mc or .c test files found in '{tests_dir}'.")
        sys.exit(0)

    print("==============================================================================")
    print(" CompileCraft - Automated Lexical Analyzer Test Suite")
    print("==============================================================================")
    print(f" Target Executable : {lexer_bin}")
    print(f" Tests Directory   : {tests_dir}")
    print(f" Total Test Cases  : {len(test_files)}")
    print("==============================================================================")

    passed_count = 0
    failed_count = 0

    for test_file in test_files:
        test_path = os.path.join(tests_dir, test_file)
        expected_path = os.path.splitext(test_path)[0] + ".expected"

        if not os.path.isfile(expected_path):
            print(f"[FAIL] {test_file}: Missing expected output file '{expected_path}'")
            failed_count += 1
            continue

        with open(expected_path, "r", encoding="utf-8") as f:
            expected_output = f.read().replace("\r\n", "\n").strip()

        # Tests named with 'error_' prefix expect a non-zero exit code (1)
        expects_error = test_file.startswith("error_")
        expected_exit = 1 if expects_error else 0

        # Execute lexer driver on test file
        proc = subprocess.run(
            [lexer_bin, test_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )

        actual_output = proc.stdout.replace("\r\n", "\n").strip()
        actual_exit = proc.returncode

        # Verification check
        output_matches = (actual_output == expected_output)
        exit_matches = (actual_exit == expected_exit)

        if output_matches and exit_matches:
            category_tag = "[EXPECTED ERROR]" if expects_error else "[VALID PROGRAM]"
            print(f"  [PASS] {test_file:<35} {category_tag} (Exit: {actual_exit})")
            passed_count += 1
        else:
            print(f"  [FAIL] {test_file:<35} Exit: {actual_exit} (Expected: {expected_exit})")
            failed_count += 1

            if not exit_matches:
                print(f"         Exit code mismatch: Got {actual_exit}, expected {expected_exit}")

            if not output_matches:
                print("         Output Diff (- expected, + actual):")
                diff = difflib.unified_diff(
                    expected_output.splitlines(),
                    actual_output.splitlines(),
                    fromfile="expected",
                    tofile="actual",
                    lineterm=""
                )
                for line in diff:
                    print(f"           {line}")

    print("==============================================================================")
    print(f" Test Summary: {passed_count} passed, {failed_count} failed out of {len(test_files)} tests.")
    print("==============================================================================")

    if failed_count > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
