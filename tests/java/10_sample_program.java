public class Main {
    public static void main(String[] args) {
        Counter c = new Counter();
        c.init(0);
        c.increment();
        System.out.println(c.getCount());
    }
}

class Counter {
    int count;

    void init(int val) {
        this.count = val;
    }

    void increment() {
        this.count++;
    }

    int getCount() {
        return this.count;
    }
}
