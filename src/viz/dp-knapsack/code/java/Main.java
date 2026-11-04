import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: "value W w1:v1 w2:v2 ..." prints the best value for capacity W; "pack W w1:v1 ..."
 * prints the best value and the numbers of the items taken.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 2) {
                continue;
            }
            int capacity = Integer.parseInt(p[1]);
            int n = p.length - 2;
            int[] weight = new int[n];
            int[] value = new int[n];
            for (int k = 0; k < n; k++) {
                String[] wv = p[k + 2].split(":");
                weight[k] = Integer.parseInt(wv[0]);
                value[k] = Integer.parseInt(wv[1]);
            }
            int best = Knapsack.table(weight, value, capacity)[n][capacity];
            switch (p[0]) {
                case "value" -> out.append(best).append('\n');
                case "pack" -> {
                    out.append(best);
                    for (int i : Knapsack.taken(weight, value, capacity)) {
                        out.append(' ').append(i);
                    }
                    out.append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}
