import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "w q|k|v rows cols
 * values" sets a weight matrix; "clear" starts a sentence and "x numbers" adds a word's
 * embedding. "attend causal scale" (1 or 0 each) prints the rows of A, a bar, and the rows of Z.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String rows(double[][] m) {
        StringJoiner out = new StringJoiner(" / ");
        for (double[] row : m) {
            StringJoiner r = new StringJoiner(" ");
            for (double v : row) r.add(three(v));
            out.add(r.toString());
        }
        return out.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Map<String, double[][]> w = new HashMap<>();
        List<double[]> x = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "w" -> {
                    int r = Integer.parseInt(p[2]), c = Integer.parseInt(p[3]);
                    double[][] m = new double[r][c];
                    for (int i = 0; i < r * c; i++) m[i / c][i % c] = Double.parseDouble(p[4 + i]);
                    w.put(p[1], m);
                }
                case "clear" -> x.clear();
                case "x" -> {
                    double[] row = new double[p.length - 1];
                    for (int i = 1; i < p.length; i++) row[i - 1] = Double.parseDouble(p[i]);
                    x.add(row);
                }
                case "attend" -> {
                    Attention.Result r = Attention.selfAttention(
                            x.toArray(new double[0][]), w.get("q"), w.get("k"), w.get("v"),
                            p[1].equals("1"), p[2].equals("1"));
                    out.append(rows(r.a())).append(" | ").append(rows(r.z())).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
