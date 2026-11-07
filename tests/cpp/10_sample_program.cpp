class Counter {
private:
    int count;

public:
    void init(int val) {
        this->count = val;
    }

    void increment() {
        this->count++;
    }

    int getCount() {
        return this->count;
    }
};

int main() {
    Counter* c = new Counter;
    c->init(0);
    c->increment();
    std::cout << c->getCount() << std::endl;
    delete c;
    return 0;
}

