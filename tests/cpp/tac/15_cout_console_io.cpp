#include <iostream>

int main() {
    int limit = 3;
    int sum = 0;

    for (int i = 1; i <= limit; i++) {
        sum = sum + i * 2;
    }

    if (sum > 10) {
        std::cout << "sum=" << sum << std::endl;
    } else if (sum == 12) {
        std::cout << "twelve" << std::endl;
    } else {
        std::cout << "other" << std::endl;
    }

    int k = 0;
    while (k < 2) {
        std::cout << "A" << std::endl << k << std::endl;
        k++;
    }

    return 0;
}
