import type { ExampleFile } from '../types/ide'

export const PROJECT_NAME = 'CompileCraft Workspace'

export const EXAMPLE_FILES: ExampleFile[] = [
  {
    id: 'demo-c',
    name: 'control_flow.c',
    path: 'src/c/control_flow.c',
    language: 'c',
    content: `#include <stdio.h>

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
`,
  },
  {
    id: 'demo-cpp',
    name: 'loops_logic.cpp',
    path: 'src/cpp/loops_logic.cpp',
    language: 'cpp',
    content: `#include <iostream>

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
`,
  },
  {
    id: 'demo-java',
    name: 'Main.java',
    path: 'src/java/Main.java',
    language: 'java',
    content: `public class Main {
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
`,
  },
  {
    id: 'invalid-c',
    name: 'undeclared_var.c',
    path: 'src/invalid/undeclared_var.c',
    language: 'c',
    content: `int main() {
    int count = 5;
    total = count + 1;
    return 0;
}
`,
  },
  {
    id: 'invalid-cpp',
    name: 'type_mismatch.cpp',
    path: 'src/invalid/type_mismatch.cpp',
    language: 'cpp',
    content: `int main() {
    bool valid = 10 + 5;
    return 0;
}
`,
  },
  {
    id: 'invalid-java',
    name: 'SyntaxError.java',
    path: 'src/invalid/SyntaxError.java',
    language: 'java',
    content: `public class SyntaxError {
    public static void main(String[] args) {
        int x = 10
        int y = x + 2;
    }
}
`,
  },
]

export function getExampleFile(id: string): ExampleFile | undefined {
  return EXAMPLE_FILES.find((file) => file.id === id)
}

export function getExampleFileForLanguage(
  language: ExampleFile['language'],
  preferredId?: string,
): ExampleFile {
  if (preferredId) {
    const preferred = getExampleFile(preferredId)
    if (preferred?.language === language) {
      return preferred
    }
  }

  return (
    EXAMPLE_FILES.find((file) => file.language === language) ?? EXAMPLE_FILES[0]
  )
}
