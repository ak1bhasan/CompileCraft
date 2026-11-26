#include <iostream>
#include <string>
using namespace std;

int main() {
    int n;
    float f;
    bool flag;
    string name;
    std::string city;

    cin >> n;
    std::cin >> name;
    cin >> n >> f;
    cin >> n >> city >> flag;

    cout << n << " " << f << " " << flag << " " << name << " " << city << endl;
    return 0;
}
