#include <iostream>

int main() {
    int count = 3;
    int sum = 0;

    for (int i = 1; i <= count; i++) {
        sum = sum + i;
    }

    std::cout << "Sum: " << sum << std::endl;
    return 0;
}
