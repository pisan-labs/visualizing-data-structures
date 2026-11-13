import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "w q|k|v rows cols
 * values" sets a weight matrix. "settings window cache" sets the window (0 keeps every token)
 * and the cache (1 on, 0 off). "prefill numbers" (4 per token) starts a new text and "decode
 * numbers" adds a token. Each prints the outputs, a bar, and how many rows the cache holds.
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

    static double[] numbers(String[] p, int from) {
        double[] out = new double[p.length - from];
        for (int i = from; i < p.length; i++) out[i - from] = Double.parseDouble(p[i]);
        return out;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Map<String, double[][]> w = new HashMap<>();
        List<double[]> xs = new ArrayList<>();
        KVCache cache = null;
        int window = 0;
        boolean useCache = true;
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
                case "settings" -> {
                    window = Integer.parseInt(p[1]);
                    useCache = p[2].equals("1");
                }
                case "prefill" -> {
                    double[] vals = numbers(p, 1);
                    xs.clear();
                    for (int i = 0; i < vals.length; i += 4)
                        xs.add(new double[] {vals[i], vals[i + 1], vals[i + 2], vals[i + 3]});
                    cache = new KVCache(w.get("q"), w.get("k"), w.get("v"), window);
                    double[][] z = cache.prefill(xs.toArray(new double[0][]));
                    if (!useCache) cache = null; // nothing is kept
                    out.append(rows(z)).append(" | ").append(cache == null ? 0 : cache.size());
                    out.append('\n');
                }
                case "decode" -> {
                    double[] x = numbers(p, 1);
                    xs.add(x);
                    double[] z = cache != null
                            ? cache.decode(x)
                            : KVCache.decodeWithoutCache(xs, w.get("q"), w.get("k"), w.get("v"), window);
                    out.append(rows(new double[][] {z})).append(" | ");
                    out.append(cache == null ? 0 : cache.size()).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
