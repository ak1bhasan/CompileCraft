int main(void) {
    int sum = 0;

    for (int i = 0; i < 5; i++) {
        if (i < 3) {
            sum = sum + i;
        } else {
            sum = sum + 1;
        }
    }

    int x = 0;

    while (x < 3) {
        x = x + 1;
    }
}
