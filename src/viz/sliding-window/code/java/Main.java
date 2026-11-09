import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "fixed k" prints "best start"; "atleast S"
 * prints the shortest length (0 for none); "distinct" prints "length start".
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int[] a = new int[0];
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "load" -> {
                    a = new int[p.length - 1];
                    for (int i = 1; i < p.length; i++) a[i - 1] = Integer.parseInt(p[i]);
                }
                case "fixed" -> {
                    int[] r = SlidingWindow.maxSum(a, Integer.parseInt(p[1]));
                    System.out.println(r[0] + " " + r[1]);
                }
                case "atleast" ->
                    System.out.println(SlidingWindow.shortestAtLeast(a, Integer.parseInt(p[1])));
                case "distinct" -> {
                    int[] r = SlidingWindow.longestDistinct(a);
                    System.out.println(r[0] + " " + r[1]);
                }
                default -> {}
            }
        }
    }
}
