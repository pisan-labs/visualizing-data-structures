import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "logits word logit ..."
 * sets the logits. "softmax T" prints every word with its probability, most likely first.
 * "sample strategy T k p ratio u" prints the kept words with their renormalized probabilities, a
 * bar, and the word drawn.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String[] words = new String[0];
        double[] logits = new double[0];
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] a = line.trim().split("\\s+");
            if (a[0].isEmpty()) continue;
            switch (a[0]) {
                case "logits" -> {
                    int n = (a.length - 1) / 2;
                    words = new String[n];
                    logits = new double[n];
                    for (int i = 0; i < n; i++) {
                        words[i] = a[1 + 2 * i];
                        logits[i] = Double.parseDouble(a[2 + 2 * i]);
                    }
                }
                case "softmax" -> {
                    double[] p = Sampling.softmax(logits, Double.parseDouble(a[1]));
                    StringJoiner s = new StringJoiner(" ");
                    for (int i : Sampling.mostLikelyFirst(p)) s.add(words[i] + " " + three(p[i]));
                    out.append(s).append('\n');
                }
                case "sample" -> {
                    double[] p = Sampling.softmax(logits, Double.parseDouble(a[2]));
                    List<Integer> kept = Sampling.cut(p, a[1], Integer.parseInt(a[3]),
                            Double.parseDouble(a[4]), Double.parseDouble(a[5]));
                    double[] q = Sampling.renormalize(p, kept);
                    int chosen = Sampling.draw(q, kept, Double.parseDouble(a[6]));
                    StringJoiner s = new StringJoiner(" ");
                    for (int i : kept) s.add(words[i] + " " + three(q[i]));
                    out.append(s).append(" | ").append(words[chosen]).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + a[0]);
            }
        }
        System.out.print(out);
    }
}
