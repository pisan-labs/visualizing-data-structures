import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "w name rows cols
 * values" sets a weight matrix and "b name values" a bias; "vocab words" names the
 * unembedding's columns; "clear" starts a sentence and "x numbers" adds a word's vector.
 * "run pre|post layer|rms relu|gelu|swiglu" prints the last word's attention weights, x1, x2
 * and the logits, three decimals each, and the guess, separated by bars.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String row(double[] v) {
        StringJoiner r = new StringJoiner(" ");
        for (double t : v) r.add(three(t));
        return r.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Map<String, double[][]> w = new HashMap<>();
        List<double[]> x = new ArrayList<>();
        String[] vocab = new String[0];
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
                case "b" -> {
                    double[] b = new double[p.length - 2];
                    for (int i = 2; i < p.length; i++) b[i - 2] = Double.parseDouble(p[i]);
                    w.put(p[1], new double[][] {b});
                }
                case "vocab" -> vocab = java.util.Arrays.copyOfRange(p, 1, p.length);
                case "clear" -> x.clear();
                case "x" -> {
                    double[] row = new double[p.length - 1];
                    for (int i = 1; i < p.length; i++) row[i - 1] = Double.parseDouble(p[i]);
                    x.add(row);
                }
                case "run" -> {
                    Block.Result r = Block.block(x.toArray(new double[0][]), w, p[1], p[2], p[3]);
                    double top = Double.NEGATIVE_INFINITY;
                    for (double v : r.logits()) top = Math.max(top, v);
                    int guess = 0;
                    while (r.logits()[guess] < top - 1e-9) guess++;
                    StringJoiner parts = new StringJoiner(" | ");
                    parts.add(row(r.a())).add(row(r.x1())).add(row(r.x2())).add(row(r.logits()));
                    parts.add(vocab[guess]);
                    out.append(parts).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
