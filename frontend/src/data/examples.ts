import type { ExampleFile } from '../types/ide'

export const PROJECT_NAME = 'demo-workspace'

export const EXAMPLE_FILES: ExampleFile[] = [
  {
    id: 'main-c',
    name: 'main.c',
    path: 'src/c/main.c',
    language: 'c',
    content: `#include <stdio.h>

int main(void) {
    int total = 0;

    for (int i = 1; i <= 5; i++) {
        total += i;
    }

    printf("sum = %d\\n", total);
    return 0;
}
`,
  },
  {
    id: 'utils-c',
    name: 'utils.c',
    path: 'src/c/utils.c',
    language: 'c',
    content: `int add(int left, int right) {
    return left + right;
}
`,
  },
  {
    id: 'main-cpp',
    name: 'main.cpp',
    path: 'src/cpp/main.cpp',
    language: 'cpp',
    content: `#include <iostream>
#include <vector>

int main() {
    std::vector<int> values = {1, 2, 3, 4, 5};
    int total = 0;

    for (int value : values) {
        total += value;
    }

    std::cout << "sum = " << total << '\\n';
    return 0;
}
`,
  },
  {
    id: 'main-java',
    name: 'Main.java',
    path: 'src/java/Main.java',
    language: 'java',
    content: `public class Main {
    public static void main(String[] args) {
        int total = 0;

        for (int i = 1; i <= 5; i++) {
            total += i;
        }

        System.out.println("sum = " + total);
    }
}
`,
  },
  {
    id: 'sample-mc',
    name: 'sample.mc',
    path: 'src/baseline/sample.mc',
    language: 'mc',
    content: `// CompileCraft baseline mini-language sample
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
`,
  },
  {
    id: 'loops-mc',
    name: 'loops.mc',
    path: 'src/baseline/loops.mc',
    language: 'mc',
    content: `int n;
int acc;

n = 4;
acc = 1;

while (n > 0) {
    acc = acc * n;
    n = n - 1;
}

print acc;
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
