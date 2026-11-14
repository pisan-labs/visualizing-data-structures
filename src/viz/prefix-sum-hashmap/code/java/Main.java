import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "count k" prints how many subarrays sum to
 * k; "longest k" prints "length start" of the longest one ("0 -1" for none).
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
                case "count" -> System.out.println(PrefixSums.countSumK(a, Integer.parseInt(p[1])));
                case "longest" -> {
                    int[] r = PrefixSums.longestSumK(a, Integer.parseInt(p[1]));
                    System.out.println(r[0] + " " + r[1]);
                }
                default -> {}
            }
        }
    }
}
