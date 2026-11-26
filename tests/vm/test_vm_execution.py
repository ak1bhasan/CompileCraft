#!/usr/bin/env python3
"""
CompileCraft - End-to-End Shared TAC VM Execution Test Suite (Milestone 15)

Verifies actual compilation + VM execution across C, C++, and Java via
bin/compilecraft.exe --run and standalone language compilers (--run).
"""

import os
import subprocess
import sys
import tempfile


def run_cmd(cmd, cwd=None, timeout=15, stdin_data=None):
    proc = subprocess.run(
        cmd,
        input=stdin_data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=cwd,
        timeout=timeout,
    )
    return (
        proc.returncode,
        proc.stdout.replace("\r\n", "\n"),
        proc.stderr.replace("\r\n", "\n"),
    )


def run_source(cli_bin, tmp_dir, filename, source, timeout=15, stdin_data=None):
    path = os.path.join(tmp_dir, filename)
    with open(path, "w", encoding="utf-8") as fp:
        fp.write(source)
    return run_cmd([cli_bin, "--run", path], cwd=tmp_dir, timeout=timeout, stdin_data=stdin_data)


def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    cli_bin = os.path.abspath(
        sys.argv[1] if len(sys.argv) > 1 else os.path.join(repo_root, "bin", "compilecraft.exe")
    )
    c_bin = os.path.join(repo_root, "bin", "compilecraft-c.exe")
    cpp_bin = os.path.join(repo_root, "bin", "compilecraft-cpp.exe")
    java_bin = os.path.join(repo_root, "bin", "compilecraft-java.exe")

    for b in (cli_bin, c_bin, cpp_bin, java_bin):
        if not os.path.isfile(b):
            print(f"Error: Executable not found: {b}")
            return 1

    tests = []

    def check(name, cond, detail=""):
        tests.append((name, bool(cond), detail))

    with tempfile.TemporaryDirectory(prefix="cc_vm_exec_") as tmp_dir:
        # 1. C IDE demo exact program
        c_demo = """#include <stdio.h>

int main() {
    int a = 10;
    int b = 4;
    int sum = 0;

    for (int i = 0; i < 4; i++) {
        sum = sum + i;
    }

    while (b > 0) {
        sum = sum + b;
        b = b - 1;
    }

    if (sum > a) {
        sum = sum + 2;
        printf("Large sum = %d", sum);
    } else if (sum == a) {
        printf("Exact sum = %d", sum);
    } else {
        sum = sum - 2;
        printf("Small sum = %d", sum);
    }

    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "demo.c", c_demo)
        check("c_ide_demo", rc == 0 and out == "Large sum = 18" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 2. C comprehensive: float, %f, %s, %%, escapes, \0 truncation, nested loops, false for loop
        c_full = """#include <stdio.h>

int main() {
    int count = 5;
    float avg = 12.5;
    _Bool ok = (count > 2) && !(count == 0);
    int neg = -count;
    int acc = 0;

    for (int k = 10; k < 5; k++) {
        acc = 999;
    }

    for (int i = 1; i <= 2; i++) {
        int j = 0;
        while (j < 2) {
            acc = acc + i + j;
            j++;
        }
    }

    if (!ok) {
        printf("unreachable");
    } else if (acc == 8 && neg == -5) {
        printf("Tag=\\"%s\\"\\tCount=%d Avg=%f Acc=%d %%\\n", "grade", count, avg, acc);
    }
    printf("StopHere\\0HiddenTail");
    return 0;
}
"""
        expected_c_full = 'Tag="grade"\tCount=5 Avg=12.500000 Acc=8 %\nStopHere'
        rc, out, err = run_source(cli_bin, tmp_dir, "full.c", c_full)
        check("c_printf_formats_escapes_nested_loops", rc == 0 and out == expected_c_full and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 3. C++ IDE demo exact program
        cpp_demo = """#include <iostream>

int main() {
    int limit = 3;
    int total = 0;

    for (int i = 1; i <= 3; i++) {
        total = total + i * 2;
    }

    while (limit > 0) {
        total = total + limit;
        limit--;
    }

    if (total >= 12 && limit == 0) {
        total = total + 10;
        std::cout << "Total = " << total << std::endl;
    } else if (total > 0) {
        std::cout << "Positive = " << total << std::endl;
    } else {
        total = total - 1;
        std::cout << "Fallback = " << total << std::endl;
    }

    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "demo.cpp", cpp_demo)
        check("cpp_ide_demo", rc == 0 and out == "Total = 28\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 4. C++ comprehensive: endl positions, float, bool, unary, modulo, else-if, nested loops
        cpp_full = """#include <iostream>

int main() {
    float f = 3.5 * 2.0;
    int rem = 17 % 5;
    bool ready = (rem == 2) || false;
    int sum = 0;
    for (int r = 0; r < 2; r++) {
        for (int c = 1; c <= 2; c++) {
            sum = sum + r + c;
        }
    }
    std::cout << std::endl << "f=" << f << std::endl << "ok=" << ready << " sum=" << sum << std::endl;
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "full.cpp", cpp_full)
        check("cpp_cout_endl_arithmetic_loops", rc == 0 and out == "\nf=7\nok=true sum=8\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 5. Java IDE demo exact program
        java_demo = """public class Main {
    public static void main(String[] args) {
        int x = 2;
        int y = 5;
        int res = 0;

        for (int i = 1; i <= 3; i++) {
            res = res + x;
        }

        while (y > 0) {
            res = res + y;
            y--;
        }

        if (res > 10 && true) {
            res = res + 1;
            System.out.println("Result = " + res);
        } else if (res == 10) {
            System.out.println("Exact 10");
        } else {
            res = res - 1;
            System.out.println("Low = " + res);
        }
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "Main.java", java_demo)
        check("java_ide_demo", rc == 0 and out == "Result = 22\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 6. Java comprehensive: print + println() + left-to-right concat + arithmetic precedence + loops
        java_full = """public class Runner {
    public static void main(String[] args) {
        int a = 2 + 3 * 4;
        float half = 7.0 / 2.0;
        boolean flag = a != 14;
        System.out.print("A=");
        System.out.println(a);
        System.out.println();
        System.out.println("Mix: " + half + ", flag=" + flag);
        int i = 0;
        while (i < 3) {
            System.out.print(i);
            i++;
        }
        System.out.println();
    }
}
"""
        expected_java_full = "A=14\n\nMix: 3.5, flag=false\n012\n"
        rc, out, err = run_source(cli_bin, tmp_dir, "Runner.java", java_full)
        check("java_print_println_concat_loops", rc == 0 and out == expected_java_full and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 7. Direct language driver --run checks
        for name, driver, fname, src, expected_out in [
            ("direct_c_run", c_bin, "direct.c", c_demo, "Large sum = 18"),
            ("direct_cpp_run", cpp_bin, "direct.cpp", cpp_demo, "Total = 28\n"),
            ("direct_java_run", java_bin, "Main.java", java_demo, "Result = 22\n"),
        ]:
            fpath = os.path.join(tmp_dir, fname)
            with open(fpath, "w", encoding="utf-8") as fp:
                fp.write(src)
            rc, out, err = run_cmd([driver, "--run", fpath], cwd=tmp_dir)
            check(name, rc == 0 and out == expected_out and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 8. Negative runtime: division by zero in C, C++, Java (partial output preserved + line number)
        c_div0 = """#include <stdio.h>
int main() {
    int d = 0;
    printf("Start\\n");
    int x = 42 / d;
    printf("Unreachable %d\\n", x);
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "div0.c", c_div0)
        check("neg_c_div_zero", rc == 1 and out == "Start\n" and "Runtime Error at line 5: Division by zero" in err, f"rc={rc} out={out!r} err={err!r}")

        cpp_mod0 = """#include <iostream>
int main() {
    int z = 0;
    std::cout << "Before mod" << std::endl;
    int r = 10 % z;
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "mod0.cpp", cpp_mod0)
        check("neg_cpp_mod_zero", rc == 1 and out == "Before mod\n" and "Runtime Error at line 5: Modulo by zero" in err, f"rc={rc} out={out!r} err={err!r}")

        java_div0 = """public class DivZero {
    public static void main(String[] args) {
        int zero = 0;
        int res = 100 / zero;
        System.out.println(res);
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "DivZero.java", java_div0)
        check("neg_java_div_zero", rc == 1 and out == "" and "Runtime Error at line 4: Division by zero" in err, f"rc={rc} out={out!r} err={err!r}")

        # 9. Negative runtime: uninitialized variable read
        c_uninit = """#include <stdio.h>
int main() {
    int x;
    printf("%d", x);
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "uninit.c", c_uninit)
        check("neg_uninit_read", rc == 1 and out == "" and "Runtime Error at line 4:" in err and "uninitialized" in err, f"rc={rc} out={out!r} err={err!r}")

        # 10. Negative runtime: infinite loop bounded by step limit (must not hang)
        cpp_inf = """int main() {
    while (true) {
    }
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "inf.cpp", cpp_inf, timeout=10)
        check("neg_infinite_loop_step_limit", rc == 1 and out == "" and "Runtime Error at line 2:" in err and "step limit" in err, f"rc={rc} out={out!r} err={err!r}")

        # 11. Compilation errors must prevent VM execution completely (zero stdout)
        bad_sem = """#include <stdio.h>
int main() {
    printf("%d", "not an int");
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "bad_sem.c", bad_sem)
        check("neg_compile_prevents_run_sem", rc == 1 and out == "" and "Semantic Error at line 3:" in err, f"rc={rc} out={out!r} err={err!r}")

        bad_syn = """public class Bad {
    public static void main(String[] args) {
        int x = 1
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "Bad.java", bad_syn)
        check("neg_compile_prevents_run_syn", rc == 1 and out == "" and "Syntax Error at line" in err, f"rc={rc} out={out!r} err={err!r}")

        # 12. Variable shadowing isolation across C and C++
        c_shadow = """#include <stdio.h>
int main() {
    int x = 10;
    {
        int x = 99;
        printf("%d ", x);
    }
    printf("%d\\n", x);
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "shadow.c", c_shadow)
        check("c_shadowing_preserves_outer", rc == 0 and out == "99 10\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        cpp_shadow = """#include <iostream>
int main() {
    int x = 10;
    {
        int x = 99;
        std::cout << x << " ";
    }
    std::cout << x << std::endl;
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "shadow.cpp", cpp_shadow)
        check("cpp_shadowing_preserves_outer", rc == 0 and out == "99 10\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 13. Inner uninitialized shadowed variable must NOT inherit outer value
        c_shadow_uninit = """#include <stdio.h>
int main() {
    int x = 10;
    {
        int x;
        printf("%d", x);
    }
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "shadow_uninit.c", c_shadow_uninit)
        check("c_shadow_uninit_traps", rc == 1 and out == "" and "Runtime Error at line 6:" in err and "uninitialized" in err, f"rc={rc} out={out!r} err={err!r}")

        # 14. Loop re-entry resets uninitialized block-local variable across C, C++, Java
        c_loop_uninit = """#include <stdio.h>
int main() {
    for (int i = 0; i < 2; i++) {
        int temp;
        if (i == 0) {
            temp = 77;
        }
        printf("%d ", temp);
    }
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "loop_uninit.c", c_loop_uninit)
        check("c_loop_reentry_uninit_traps", rc == 1 and out == "77 " and "Runtime Error at line 8:" in err and "uninitialized" in err, f"rc={rc} out={out!r} err={err!r}")

        cpp_loop_uninit = """#include <iostream>
int main() {
    for (int i = 0; i < 2; i++) {
        int temp;
        if (i == 0) {
            temp = 77;
        }
        std::cout << temp << " ";
    }
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "loop_uninit.cpp", cpp_loop_uninit)
        check("cpp_loop_reentry_uninit_traps", rc == 1 and out == "77 " and "Runtime Error at line 8:" in err and "uninitialized" in err, f"rc={rc} out={out!r} err={err!r}")

        java_loop_uninit = """public class LoopUninit {
    public static void main(String[] args) {
        for (int i = 0; i < 2; i++) {
            int temp;
            if (i == 0) {
                temp = 77;
            }
            System.out.print(temp + " ");
        }
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "LoopUninit.java", java_loop_uninit)
        check("java_loop_reentry_uninit_traps", rc == 1 and out == "77 " and "Runtime Error at line 8:" in err and "uninitialized" in err, f"rc={rc} out={out!r} err={err!r}")

        # 15. Implicit int -> float conversion (init, expr, reassignment, division) in C, C++, Java
        c_itof = """#include <stdio.h>
int main() {
    float a = 2;
    float b = 3 + 4;
    float c;
    c = 10;
    float d = a / 4;
    printf("%f %f %f %f\\n", a, b, c, d);
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "itof.c", c_itof)
        check("c_int_to_float_init_assign_div", rc == 0 and out == "2.000000 7.000000 10.000000 0.500000\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        cpp_itof = """#include <iostream>
int main() {
    float a = 2;
    float b = 3 + 4;
    float c;
    c = 10;
    float h = b / 2;
    std::cout << a << " " << b << " " << c << " " << h << std::endl;
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "itof.cpp", cpp_itof)
        check("cpp_int_to_float_init_assign_div", rc == 0 and out == "2 7 10 3.5\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        java_itof = """public class ItofJava {
    public static void main(String[] args) {
        float a = 2;
        float b = 3 + 4;
        float c;
        c = 10;
        float h = b / 2;
        System.out.println(a + " " + b + " " + c + " " + h);
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "ItofJava.java", java_itof)
        check("java_int_to_float_init_assign_div", rc == 0 and out == "2 7 10 3.5\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 16. Float literal precision (DBL_DECIMAL_DIG round-trip) + negative + magnitudes
        c_pi = """#include <stdio.h>
int main() {
    float exact = 1.0000000000000002;
    float pi = 3.14159265;
    float neg = -5.0;
    float small = 0.00000000000000000001;
    float big = 100000000000000000000.0;
    printf("%.17f %.8f %.1f %.20f %.1f", exact, pi, neg, small, big);
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "pi.c", c_pi)
        check("c_float_precision_roundtrip", rc == 0 and out == "1.00000000000000022 3.14159265 -5.0 0.00000000000000000001 100000000000000000000.0" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 16b. Self-shadowing initializer aligned with semantic analysis + long shadowed identifier
        c_self_shadow = """#include <stdio.h>
int main() {
    int x = 10;
    {
        int x = x + 1;
        printf("%d ", x);
    }
    printf("%d", x);
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "self_shadow.c", c_self_shadow)
        check("c_self_shadow_init_outer", rc == 0 and out == "11 10" and err == "", f"rc={rc} out={out!r} err={err!r}")

        cpp_self_shadow = """#include <iostream>
int main() {
    int x = 10;
    {
        int x = x + 1;
        std::cout << x << " ";
    }
    std::cout << x;
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "self_shadow.cpp", cpp_self_shadow)
        check("cpp_self_shadow_init_outer", rc == 0 and out == "11 10" and err == "", f"rc={rc} out={out!r} err={err!r}")

        c_self_undecl = """#include <stdio.h>
int main() {
    {
        int x = x + 1;
        printf("%d", x);
    }
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "self_undecl.c", c_self_undecl)
        check("c_self_undecl_sem_rejected", rc == 1 and out == "" and "Semantic Error at line 4:" in err, f"rc={rc} out={out!r} err={err!r}")

        long_name = "long_identifier_" + ("a" * 160)
        c_long_shadow = f"""#include <stdio.h>
int main() {{
    int {long_name} = 10;
    {{
        int {long_name} = 42;
        printf("%d ", {long_name});
    }}
    printf("%d", {long_name});
    return 0;
}}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "long_shadow.c", c_long_shadow)
        check("c_long_identifier_shadowing", rc == 0 and out == "42 10" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 16c. Java parity: self-shadowing initializer, nested shadowing, float init/reassign, uninit error
        java_self_shadow = """public class Main {
    public static void main(String[] args) {
        int x = 10;
        {
            int x = x + 1;
            System.out.println(x);
        }
        System.out.println(x);
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "Main.java", java_self_shadow)
        check("java_self_shadow_init_outer", rc == 0 and out == "11\n10\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        java_float_assign = """public class Main {
    public static void main(String[] args) {
        float a = 2;
        float b = 3 + 4;
        float c;
        c = 10;
        System.out.println(a);
        System.out.println(b);
        System.out.println(c);
        System.out.println(b / 2);
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "FloatAssign.java", java_float_assign)
        check("java_float_init_reassign", rc == 0 and out == "2\n7\n10\n3.5\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        java_nested_shadow = """public class NestedJava {
    public static void main(String[] args) {
        int v = 1;
        {
            int v = 20;
            {
                int v = 300;
                System.out.print(v + " ");
            }
            System.out.print(v + " ");
        }
        System.out.println(v);
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "NestedJava.java", java_nested_shadow)
        check("java_nested_shadowing_preserves_outer", rc == 0 and out == "300 20 1\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        java_uninit_shadow = """public class UninitJava {
    public static void main(String[] args) {
        int x = 10;
        {
            int x;
            System.out.println(x);
        }
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "UninitJava.java", java_uninit_shadow)
        check("java_shadow_uninit_traps", rc == 1 and out == "" and "Runtime Error at line 6: Read of uninitialized variable 'x'" in err, f"rc={rc} out={out!r} err={err!r}")

        # 17. Signed 32-bit integer overflow & INT_MIN div/mod boundaries
        c_ovf_clean = """#include <stdio.h>
int main() {
    int maxv = 2147483647;
    int minv = -2147483647 - 1;
    int neg = -1;
    int add_w = maxv + 1;
    int sub_w = minv - 1;
    int mul_w = 46341 * 46341;
    int mod_ok = minv % neg;
    printf("%d %d %d %d\\n", add_w, sub_w, mul_w, mod_ok);
    int bad_div = minv / neg;
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "ovf.c", c_ovf_clean)
        check("c_signed_overflow_and_int_min_div", rc == 1 and out == "-2147483648 2147483647 -2147479015 0\n" and "Runtime Error at line 11:" in err and "overflow" in err, f"rc={rc} out={out!r} err={err!r}")

        # 18. M16 C scanf interactive & formatted input pipeline
        c_scanf_ok = """#include <stdio.h>
int main() {
    int a;
    float f;
    char w1[5];
    char w2[5];
    char rest[16];
    printf("Prompt:");
    scanf("%d,%f", &a, &f);
    scanf("%s", w1);
    scanf("%2s %s", w2, rest);
    printf("%d|%.2f|%s|%s|%s\\n", a, f, w1, w2, rest);
    return 0;
}
"""
        rc, out, err = run_source(
            cli_bin, tmp_dir, "scanf_ok.c", c_scanf_ok, stdin_data="12,3.5 abcdef ghi\n"
        )
        check("c_scanf_prefix_bounded_and_flush", rc == 0 and out == "Prompt:12|3.50|abcd|ef|ghi\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 19. M16 C scanf loop and %% literal matching
        c_scanf_loop = """#include <stdio.h>
int main() {
    int n;
    scanf("%d", &n);
    int sum = 0;
    for (int i = 0; i < n; i++) {
        int v;
        scanf("%d%%", &v);
        sum = sum + v;
    }
    printf("sum=%d\\n", sum);
    return 0;
}
"""
        rc, out, err = run_source(
            cli_bin, tmp_dir, "scanf_loop.c", c_scanf_loop, stdin_data="3\n10% 25% 15%\n"
        )
        check("c_scanf_loop_and_percent_literal", rc == 0 and out == "sum=50\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 20. M16 C++ cin chained input and bool 0/1 handling
        cpp_cin_ok = """#include <iostream>
#include <string>
using namespace std;
int main() {
    int n;
    float r;
    bool b0;
    bool b1;
    string name;
    cout << "Enter:" << endl;
    cin >> n >> r >> b0 >> b1 >> name;
    cout << n << ":" << r << ":" << b0 << ":" << b1 << ":" << name << endl;
    return 0;
}
"""
        rc, out, err = run_source(
            cli_bin, tmp_dir, "cin_ok.cpp", cpp_cin_ok, stdin_data="7 1.25 0 1 Alice\n"
        )
        check("cpp_cin_chained_and_numeric_bool", rc == 0 and out == "Enter:\n7:1.25:false:true:Alice\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 21. M16 C++ cin bool rejects "true" without boolalpha
        cpp_cin_bad_bool = """#include <iostream>
using namespace std;
int main() {
    bool ok;
    cin >> ok;
    return 0;
}
"""
        rc, out, err = run_source(
            cli_bin, tmp_dir, "cin_bad_bool.cpp", cpp_cin_bad_bool, stdin_data="true\n"
        )
        check("cpp_cin_bool_rejects_true", rc == 1 and "Runtime Error at line 5:" in err and "boolalpha is not supported" in err, f"rc={rc} out={out!r} err={err!r}")

        # 22. M16 Java Scanner full pipeline including nextLine & strict token checks
        java_scanner_ok = """import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        String tail = sc.nextLine();
        String line1 = sc.nextLine();
        String empty = sc.nextLine();
        float f = sc.nextFloat();
        boolean ok = sc.nextBoolean();
        String w = sc.next();
        System.out.println(n + "|[" + tail + "]|[" + line1 + "]|[" + empty + "]|" + f + "|" + ok + "|" + w);
    }
}
"""
        rc, out, err = run_source(
            cli_bin,
            tmp_dir,
            "ScannerOk.java",
            java_scanner_ok,
            stdin_data="7  tail\nhello world\n\n2.5 false end\n",
        )
        check("java_scanner_all_methods_nextline", rc == 0 and out == "7|[  tail]|[hello world]|[]|2.5|false|end\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 23. M16 Java Scanner strict complete-token validation vs C/C++ prefix extraction
        java_strict_int = """import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println("before");
        int x = sc.nextInt();
        System.out.println(x);
    }
}
"""
        rc, out, err = run_source(
            cli_bin, tmp_dir, "StrictJava.java", java_strict_int, stdin_data="12abc\n"
        )
        check("java_scanner_strict_token_preserves_out", rc == 1 and out == "before\n" and "Runtime Error at line 6:" in err and "Invalid integer input" in err, f"rc={rc} out={out!r} err={err!r}")

        # 24. M16 EOF and invalid input runtime error with partial output preserved
        c_eof_err = """#include <stdio.h>
int main() {
    int x;
    printf("hello\\n");
    scanf("%d", &x);
    return 0;
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "eof.c", c_eof_err, stdin_data="")
        check("c_scanf_eof_preserves_partial_output", rc == 1 and out == "hello\n" and "Runtime Error at line 5:" in err and "end of input" in err, f"rc={rc} out={out!r} err={err!r}")

        # 25. M16 C++ cin inside loops and conditionals
        cpp_cin_loop_cond = """#include <iostream>
using namespace std;
int main() {
    int count;
    cin >> count;
    int pos = 0;
    for (int i = 0; i < count; i++) {
        int val;
        cin >> val;
        if (val > 0) {
            pos = pos + val;
        }
    }
    cout << pos << endl;
    return 0;
}
"""
        rc, out, err = run_source(
            cli_bin, tmp_dir, "cin_loop_cond.cpp", cpp_cin_loop_cond, stdin_data="4\n5 -3 10 0\n"
        )
        check("cpp_cin_inside_loop_and_if", rc == 0 and out == "15\n" and err == "", f"rc={rc} out={out!r} err={err!r}")

        # 26. M16 Java Scanner used as ordinary value is rejected semantically
        java_scanner_as_val = """import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int x = sc + 1;
    }
}
"""
        rc, out, err = run_source(cli_bin, tmp_dir, "ScannerAsVal.java", java_scanner_as_val)
        check("java_scanner_disallowed_in_arith", rc == 1 and "Semantic Error at line 5:" in err, f"rc={rc} out={out!r} err={err!r}")

    passed = sum(1 for _, ok, _ in tests if ok)
    failed = len(tests) - passed

    print("==============================================================================")
    print(" CompileCraft - Shared TAC VM End-to-End Execution Suite (Milestone 15)")
    print("==============================================================================")
    print(f" Target Executable : {cli_bin}")
    print(f" Total Test Cases  : {len(tests)}")
    print("==============================================================================")
    for name, ok, detail in tests:
        tag = "[PASS]" if ok else "[FAIL]"
        print(f"  {tag} {name:<38}")
        if not ok:
            print(f"         {detail}")
    print("==============================================================================")
    print(f" Test Summary: {passed} passed, {failed} failed out of {len(tests)} tests.")
    print("==============================================================================")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
