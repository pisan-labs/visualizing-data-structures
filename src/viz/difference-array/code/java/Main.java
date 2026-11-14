import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: "load v1 v2 ..." replaces the array and drops queued updates; "add l r x" queues
 * an update; "apply" applies the queued updates, prints the array, and empties the queue.
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int[] a = new int[0];
        List<int[]> queued = new ArrayList<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "load" -> {
                    a = new int[p.length - 1];
                    for (int i = 1; i < p.length; i++) a[i - 1] = Integer.parseInt(p[i]);
                    queued.clear();
                }
                case "add" -> queued.add(new int[] {
                    Integer.parseInt(p[1]), Integer.parseInt(p[2]), Integer.parseInt(p[3])
                });
                case "apply" -> {
                    a = DifferenceArray.applyUpdates(a, queued);
                    queued.clear();
                    StringBuilder out = new StringBuilder();
                    for (int i = 0; i < a.length; i++) out.append(i > 0 ? " " : "").append(a[i]);
                    System.out.println(out);
                }
                default -> {}
            }
        }
    }
}
