import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Collections;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "top k" prints the k largest from largest
 * down; "kth k" prints the k-th largest.
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
                case "top" -> {
                    List<Integer> top = TopK.topK(a, Integer.parseInt(p[1]));
                    top.sort(Collections.reverseOrder());
                    StringJoiner out = new StringJoiner(" ");
                    for (int x : top) out.add(String.valueOf(x));
                    System.out.println(out);
                }
                case "kth" -> System.out.println(TopK.kthLargest(a, Integer.parseInt(p[1])));
                default -> {}
            }
        }
    }
}
