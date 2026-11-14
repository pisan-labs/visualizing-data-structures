import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "partition p" partitions it in place and
 * prints the values, then "| low high".
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
                case "partition" -> {
                    int[] r = ThreeWay.partition(a, Integer.parseInt(p[1]));
                    StringBuilder out = new StringBuilder();
                    for (int v : a) out.append(v).append(' ');
                    System.out.println(out + "| " + r[0] + " " + r[1]);
                }
                default -> {}
            }
        }
    }
}
