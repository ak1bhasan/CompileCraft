#include <stdio.h>

int main() {
    int count = 3;
    int sum = 0;

    for (int i = 1; i <= count; i++) {
        sum = sum + i;
    }

    if (sum > 5) {
        printf("Sum = %d", sum);
    } else {
        printf("Small");
    }

    return 0;
}
