import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "count word n" adds a
 * word and its count; "noise" prints the noise distribution. "w word x y" and "c word x y" set
 * a word's vectors. "pairs L words" prints the pairs as center:context. "update lr k center
 * context u..." draws k noise words with the u's, updates, and prints the noise words, the
 * sigmoids, the new w and the new c.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String vec(double[] v) {
        StringJoiner out = new StringJoiner(" ");
        for (double x : v) out.add(three(x));
        return out.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Map<String, Integer> counts = new LinkedHashMap<>();
        Map<String, Double> noise = new LinkedHashMap<>();
        Map<String, double[]> w = new HashMap<>();
        Map<String, double[]> c = new HashMap<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "count" -> {
                    counts.put(p[1], Integer.parseInt(p[2]));
                    noise = Word2Vec.noiseDistribution(counts);
                }
                case "noise" -> {
                    StringJoiner j = new StringJoiner(" ");
                    for (double x : noise.values()) j.add(three(x));
                    out.append(j).append('\n');
                }
                case "w" -> w.put(p[1], new double[] {Double.parseDouble(p[2]), Double.parseDouble(p[3])});
                case "c" -> c.put(p[1], new double[] {Double.parseDouble(p[2]), Double.parseDouble(p[3])});
                case "pairs" -> {
                    List<String> words = Arrays.asList(p).subList(2, p.length);
                    StringJoiner j = new StringJoiner(" ");
                    for (String[] pr : Word2Vec.pairs(words, Integer.parseInt(p[1])))
                        j.add(pr[0] + ":" + pr[1]);
                    out.append(j.length() > 0 ? j.toString() : "-").append('\n');
                }
                case "update" -> {
                    double lr = Double.parseDouble(p[1]);
                    int k = Integer.parseInt(p[2]);
                    String center = p[3], context = p[4];
                    int[] next = {5};
                    List<String> negs = Word2Vec.negatives(
                            noise, k, center, context, () -> Double.parseDouble(p[next[0]++]));
                    double[] sigmas = Word2Vec.update(w, c, center, context, negs, lr);
                    out.append(negs.isEmpty() ? "-" : String.join(" ", negs))
                            .append(" | ").append(vec(sigmas))
                            .append(" | ").append(vec(w.get(center)))
                            .append(" | ").append(vec(c.get(context))).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
