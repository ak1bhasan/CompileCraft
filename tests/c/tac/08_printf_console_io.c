#include <stdio.h>

int main() {
    int n = 4;
    int sum = 0;

    for (int i = 1; i <= n; i++) {
        sum = sum + i;
    }

    if (sum > 10) {
        printf("high");
    } else if (sum == 10) {
        printf("exact");
    } else {
        printf("low");
    }

    int k = 0;
    while (k < 2) {
        printf("%d", k);
        k++;
    }

    printf("%d", sum);
    return 0;
}
