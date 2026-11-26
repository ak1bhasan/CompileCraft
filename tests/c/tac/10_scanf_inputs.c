#include <stdio.h>

int main() {
    int n;
    float f;
    char name[16];
    char tag[6];

    scanf("%d", &n);
    scanf("%f", &f);
    scanf("%s", name);
    scanf("%4s", tag);
    scanf("%d %f", &n, &f);
    scanf("%d,%f %% %4s", &n, &f, tag);

    printf("%d %.2f %s %s\n", n, f, name, tag);
    return 0;
}
