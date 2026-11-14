import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "sort" sorts it with cyclic sort and prints
 * the values, then "| missing | repeated" ("-" for an empty list).
 */
public class Main {
    static String show(List<Integer> xs) {
        if (xs.isEmpty()) return "-";
        StringBuilder out = new StringBuilder();
        for (int x : xs) out.append(out.length() > 0 ? " " : "").append(x);
        return out.toString();
    }

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
                case "sort" -> {
                    List<List<Integer>> r = CyclicSort.missingAndRepeated(a);
                    List<Integer> values = new ArrayList<>();
                    for (int v : a) values.add(v);
                    System.out.println(show(values) + " | " + show(r.get(0)) + " | " + show(r.get(1)));
                }
                default -> {}
            }
        }
    }
}
