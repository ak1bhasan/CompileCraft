int main() {
    bool active;
    int sum;
    active = true;
    sum = 0;
    for (int i = 0; i < 3; i++) {
        if (active && (i < 2)) {
            sum = sum + i;
        } else {
            sum = sum + 1;
        }
    }
}
