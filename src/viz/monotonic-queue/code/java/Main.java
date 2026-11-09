import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "max k" prints the maximum of every window
 * of k values; "min k" prints every window's minimum.
 */
public class Main {
    static String join(int[] a) {
        StringJoiner j = new StringJoiner(" ");
        for (int v : a) j.add(String.valueOf(v));
        return j.toString();
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
                case "max" -> System.out.println(join(MonotonicQueue.windowMax(a, Integer.parseInt(p[1]))));
                case "min" -> System.out.println(join(MonotonicQueue.windowMin(a, Integer.parseInt(p[1]))));
                default -> {}
            }
        }
    }
}
