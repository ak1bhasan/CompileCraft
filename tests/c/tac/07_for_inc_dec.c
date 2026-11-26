int main(void) {
    int sum = 0;
    int k = 4;
    k++;
    ++k;
    k--;
    --k;
    for (int i = 0; i < 3; ++i) {
        sum = sum + i;
    }
    for (int j = 3; j > 0; j--) {
        sum = sum + j;
    }
}
