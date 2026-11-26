#include <iostream>

int main() {
    int x = 10;
    std::cout << std::endl << "Start" << std::endl << x + 1 << std::endl;
    if (x > 5) {
        std::cout << "Nested" << std::endl;
    } else {
        std::cout << "Other";
    }
    int y = x + 2;
    std::cout << y << std::endl;
    return 0;
}
