import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int count = sc.nextInt();
        float ratio = sc.nextFloat();
        boolean ok = sc.nextBoolean();
        String word;
        word = sc.next();
        String rest = sc.nextLine();
        System.out.println(count + ":" + ratio + ":" + ok + ":" + word + ":" + rest);
    }
}
