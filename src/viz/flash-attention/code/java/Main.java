import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "clear" starts a
 * sentence and "qkv q1 q2 k1 k2 v1 v2" adds a word's query, key and value. "flash kv|q br bc
 * causal" and "plain causal" (1 or 0) print the rows of O, then m, then l, three decimals each,
 * then the numbers moved: Q, K and V, O m l, the table.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String nums(double[] xs) {
        StringJoiner out = new StringJoiner(" ");
        for (double x : xs) out.add(three(x));
        return out.toString();
    }

    static String line(FlashAttention.Result r) {
        StringJoiner rows = new StringJoiner(" / ");
        for (double[] row : r.o()) rows.add(nums(row));
        StringJoiner moved = new StringJoiner(" ");
        for (long x : r.moved()) moved.add(Long.toString(x));
        return rows + " | " + nums(r.m()) + " | " + nums(r.l()) + " | " + moved;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<double[]> q = new ArrayList<>(), k = new ArrayList<>(), v = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        String text;
        while ((text = in.readLine()) != null) {
            String[] p = text.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            double[][] none = new double[0][];
            switch (p[0]) {
                case "clear" -> {
                    q.clear();
                    k.clear();
                    v.clear();
                }
                case "qkv" -> {
                    double[] x = new double[6];
                    for (int i = 0; i < 6; i++) x[i] = Double.parseDouble(p[1 + i]);
                    q.add(new double[] {x[0], x[1]});
                    k.add(new double[] {x[2], x[3]});
                    v.add(new double[] {x[4], x[5]});
                }
                case "flash" -> out.append(line(FlashAttention.flash(q.toArray(none),
                        k.toArray(none), v.toArray(none), Integer.parseInt(p[2]),
                        Integer.parseInt(p[3]), p[4].equals("1"), p[1].equals("q")))).append('\n');
                case "plain" -> out.append(line(FlashAttention.plain(q.toArray(none),
                        k.toArray(none), v.toArray(none), p[1].equals("1")))).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
