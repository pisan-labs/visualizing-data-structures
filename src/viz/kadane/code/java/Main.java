import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "max" prints "best lo hi" of the maximum
 * subarray; "max_or_empty" does the same with the empty subarray allowed ("0 0 -1").
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
                case "max", "max_or_empty" -> {
                    int[] r = Kadane.maxSubarray(a, p[0].equals("max_or_empty"));
                    System.out.println(r[0] + " " + r[1] + " " + r[2]);
                }
                default -> {}
            }
        }
    }
}
