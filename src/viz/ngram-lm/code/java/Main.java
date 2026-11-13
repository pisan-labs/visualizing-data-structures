import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "model n k" starts a
 * model and "train words" adds a sentence (no output). "count" prints the n-grams counted and how
 * many differ; "counts context" the tokens seen after it with their counts; "next context" every
 * token with a probability above 0; "generate u1 u2 ..." the tokens drawn; "score words" the
 * perplexity, or inf.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        NgramModel model = new NgramModel(2, 0);
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] a = line.trim().split("\\s+");
            if (a[0].isEmpty()) continue;
            List<String> rest = Arrays.asList(a).subList(1, a.length);
            switch (a[0]) {
                case "model" -> model = new NgramModel(Integer.parseInt(a[1]), Double.parseDouble(a[2]));
                case "train" -> model.train(rest);
                case "count" -> {
                    int tokens = 0, distinct = 0;
                    for (int t : model.totals.values()) tokens += t;
                    for (Map<String, Integer> row : model.counts.values()) distinct += row.size();
                    out.append(tokens).append(' ').append(distinct).append('\n');
                }
                case "counts" -> {
                    Map<String, Integer> row = model.counts.getOrDefault(String.join(" ", rest), Map.of());
                    List<Map.Entry<String, Integer>> seen = new ArrayList<>(row.entrySet());
                    seen.sort((x, y) -> !x.getValue().equals(y.getValue())
                            ? y.getValue() - x.getValue() : x.getKey().compareTo(y.getKey()));
                    StringJoiner s = new StringJoiner(" ");
                    for (Map.Entry<String, Integer> e : seen) s.add(e.getKey() + " " + e.getValue());
                    out.append(seen.isEmpty() ? "none" : s.toString()).append('\n');
                }
                case "next" -> {
                    StringJoiner s = new StringJoiner(" ");
                    for (NgramModel.Choice c : model.nextWords(rest)) s.add(c.word() + " " + three(c.p()));
                    out.append(s.length() == 0 ? "none" : s.toString()).append('\n');
                }
                case "generate" -> {
                    double[] us = new double[rest.size()];
                    for (int i = 0; i < us.length; i++) us[i] = Double.parseDouble(rest.get(i));
                    out.append(String.join(" ", model.generate(us, 10))).append('\n');
                }
                case "score" -> {
                    double pp = model.perplexity(rest);
                    out.append(Double.isInfinite(pp) ? "inf" : three(pp)).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + a[0]);
            }
        }
        System.out.print(out);
    }
}
