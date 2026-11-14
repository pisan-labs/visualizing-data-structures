import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "load n numbers" sets
 * the gradients, worker by worker (no output). "scatter", "gather" and "allreduce" run that part,
 * skipping what has already run, and print every worker's vector, " / " between workers.
 */
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        long[][] v = new long[0][];
        String phase = "start";
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            if (p[0].equals("load")) {
                int n = Integer.parseInt(p[1]);
                v = new long[n][n];
                for (int k = 0; k < n * n; k++) v[k / n][k % n] = Long.parseLong(p[2 + k]);
                phase = "start";
                continue;
            }
            switch (p[0]) {
                case "scatter" -> {
                    if (phase.equals("start")) {
                        RingAllReduce.reduceScatter(v);
                        phase = "scattered";
                    }
                }
                case "gather", "allreduce" -> {
                    if (!phase.equals("done")) {
                        if (phase.equals("start")) RingAllReduce.reduceScatter(v);
                        RingAllReduce.allGather(v);
                        phase = "done";
                    }
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
            StringJoiner rows = new StringJoiner(" / ");
            for (long[] row : v) {
                StringJoiner r = new StringJoiner(" ");
                for (long x : row) r.add(Long.toString(x));
                rows.add(r.toString());
            }
            out.append(rows).append('\n');
        }
        System.out.print(out);
    }
}
