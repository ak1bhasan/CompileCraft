public class ValidJava {
    public static void main(String[] args) {
        boolean active = true;
        int total = 0;
        for (int i = 0; i < 4; i++) {
            if (active && (i < 2)) {
                total = total + i * 2;
            } else {
                total = total + 1;
            }
        }
        int k = 2;
        while (k > 0) {
            k--;
        }
    }
}
