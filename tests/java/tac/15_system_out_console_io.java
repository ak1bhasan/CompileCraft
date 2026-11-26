public class Main {
    public static void main(String[] args) {
        int limit = 3;
        int sum = 0;

        for (int i = 1; i <= limit; i++) {
            sum = sum + i;
            if (sum > 3) {
                System.out.println("gt3: " + sum);
            } else if (sum == 3) {
                System.out.println("eq3");
            } else {
                System.out.print(sum);
            }
        }

        int k = 0;
        while (k < 2) {
            System.out.println(1 + 2 + "x=" + (k + 1));
            k++;
        }

        System.out.println();
    }
}
