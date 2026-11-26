public class Main {
    public static void main(String[] args) {
        boolean flag = true;
        int sum = 0;
        for (int i = 0; i < 4; i++) {
            if (flag && (i < 2)) {
                sum = sum + i;
            } else {
                sum = sum + 2;
            }
        }
        int k = 3;
        while (k > 0) {
            --k;
        }
    }
}
