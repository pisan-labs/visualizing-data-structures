import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: "solve c00 c01 ... / c10 c11 ... / ..." reads a cost table row by row (one row
 * per worker) and prints the least total, then the task of each worker.
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            line = line.trim();
            if (!line.startsWith("solve ")) continue;
            String[] rows = line.substring(6).split("/");
            int[][] cost = new int[rows.length][];
            for (int w = 0; w < rows.length; w++) {
                String[] p = rows[w].trim().split("\\s+");
                cost[w] = new int[p.length];
                for (int t = 0; t < p.length; t++) cost[w][t] = Integer.parseInt(p[t]);
            }
            StringJoiner out = new StringJoiner(" ");
            for (int v : Assignment.cheapest(cost)) out.add(String.valueOf(v));
            System.out.println(out);
        }
    }
}
