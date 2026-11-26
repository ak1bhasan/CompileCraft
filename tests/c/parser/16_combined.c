int main(void) {
    int sum;
    sum = 0;
    for (int i = 0; i < 3; i++) {
        if (i < 2) {
            sum = sum + i;
        } else {
            sum = sum + 1;
        }
    }
}
