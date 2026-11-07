int compute(int x, int y) {
    int result = 0;
    for (int i = 0; i < y; ++i) {
        result += x;
    }
    return result;
}

int main() {
    int a = 10;
    int b = 5;
    int total = compute(a, b);
    printf("Total: %d\n", total);
    return 0;
}

