public class Main {
    public static void main(String[] args) {
        boolean active = true;
        int sum = 0;

        for (int i = 0; i < 5; i++) {
            if (active && (i < 3)) {
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
}
