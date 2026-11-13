import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "points x y x y ..."
 * and "place x y ..." set the points and the centres (no output). "seed plus|random k u1 ... uk"
 * prints the indices of the points chosen. "assign" prints the labels and WCSS; "update
 * farthest|stay" the centres and WCSS; "run farthest|stay" the rounds, the labels, the centres
 * and WCSS. Three decimals.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static double[][] pairs(String[] p, int from) {
        double[][] out = new double[(p.length - from) / 2][];
        for (int i = 0; i < out.length; i++)
            out[i] = new double[] {Double.parseDouble(p[from + 2 * i]), Double.parseDouble(p[from + 2 * i + 1])};
        return out;
    }

    static String show(double[][] centres) {
        StringJoiner out = new StringJoiner(" / ");
        for (double[] c : centres) out.add(three(c[0]) + " " + three(c[1]));
        return out.toString();
    }

    static String labels(int[] labels) {
        StringJoiner out = new StringJoiner(" ");
        for (int c : labels) out.add(String.valueOf(c));
        return out.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        double[][] points = new double[0][], centres = new double[0][];
        int[] labels = null;
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "points" -> {
                    points = pairs(p, 1);
                    centres = new double[0][];
                    labels = null;
                }
                case "place" -> {
                    centres = pairs(p, 1);
                    labels = null;
                }
                case "seed" -> {
                    int k = Integer.parseInt(p[2]);
                    double[] draws = new double[k];
                    for (int i = 0; i < k; i++) draws[i] = Double.parseDouble(p[3 + i]);
                    int[] next = {0};
                    int[] chosen = p[1].equals("plus")
                            ? KMeans.kmeansPP(points, k, () -> draws[next[0]++])
                            : KMeans.randomSeeds(points, k, () -> draws[next[0]++]);
                    centres = new double[k][];
                    for (int c = 0; c < k; c++) centres[c] = points[chosen[c]];
                    labels = null;
                    out.append(labels(chosen)).append('\n');
                }
                case "assign" -> {
                    labels = KMeans.assign(points, centres);
                    out.append(labels(labels)).append(" | ")
                            .append(three(KMeans.wcss(points, labels, centres))).append('\n');
                }
                case "update" -> {
                    centres = KMeans.update(points, labels, centres, p[1]);
                    out.append(show(centres)).append(" | ")
                            .append(three(KMeans.wcss(points, labels, centres))).append('\n');
                }
                case "run" -> {
                    KMeans.Result r = KMeans.lloyd(points, centres, labels, p[1], 20);
                    centres = r.centres();
                    labels = r.labels();
                    out.append(r.rounds()).append(" | ").append(labels(labels)).append(" | ")
                            .append(show(centres)).append(" | ")
                            .append(three(KMeans.wcss(points, labels, centres))).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
