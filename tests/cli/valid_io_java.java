public class ConsoleIo {
    public static void main(String[] args) {
        int count = 3;
        int sum = 0;

        for (int i = 1; i <= count; i++) {
            sum = sum + i;
        }

        System.out.println("Sum: " + sum);
    }
}
