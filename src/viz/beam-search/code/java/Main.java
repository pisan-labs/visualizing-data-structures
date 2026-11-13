import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "p word next
 * probability" adds a row of the model. "search start B norm(1|0) shrink|refill maxLength" prints
 * the finished hypotheses in the order they finished, each with its log-probability, then "=>"
 * and the best.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Map<String, List<BeamSearch.Next>> model = new HashMap<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] a = line.trim().split("\\s+");
            if (a[0].isEmpty()) continue;
            switch (a[0]) {
                case "p" -> model.computeIfAbsent(a[1], w -> new ArrayList<>())
                        .add(new BeamSearch.Next(a[2], Double.parseDouble(a[3])));
                case "search" -> {
                    List<BeamSearch.Hyp> finished = BeamSearch.search(model, a[1],
                            Integer.parseInt(a[2]), a[4], Integer.parseInt(a[5]));
                    BeamSearch.Hyp best = BeamSearch.best(finished, a[3].equals("1"));
                    StringJoiner s = new StringJoiner(" | ");
                    for (BeamSearch.Hyp h : finished)
                        s.add(String.join(" ", h.words()) + " " + three(h.score()));
                    out.append(s).append(" => ")
                            .append(best == null ? "none" : String.join(" ", best.words()))
                            .append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + a[0]);
            }
        }
        System.out.print(out);
    }
}
