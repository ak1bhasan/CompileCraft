public class Main {
    public static void main(String[] args) {
        int x = 1;
        {
            int y = 2;
            {
                x = x + y;
            }
        }
    }
}
