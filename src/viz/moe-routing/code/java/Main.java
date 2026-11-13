import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "w rows cols values"
 * sets the router; "clear" starts a sentence and "x numbers" adds a token. "route k cf
 * token|expert" prints, for each token, its kept experts and weights ("2:0.818", "-" for none)
 * separated by slashes; then the number of dropped assignments and of tokens with no expert;
 * then the load-balance loss.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        double[][] w = new double[0][];
        List<double[]> x = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "w" -> {
                    int r = Integer.parseInt(p[1]), c = Integer.parseInt(p[2]);
                    w = new double[r][c];
                    for (int i = 0; i < r * c; i++) w[i / c][i % c] = Double.parseDouble(p[3 + i]);
                }
                case "clear" -> x.clear();
                case "x" -> {
                    double[] row = new double[p.length - 1];
                    for (int i = 1; i < p.length; i++) row[i - 1] = Double.parseDouble(p[i]);
                    x.add(row);
                }
                case "route" -> {
                    Moe.Result r = Moe.route(x.toArray(new double[0][]), w, Integer.parseInt(p[1]),
                            Double.parseDouble(p[2]), p[3]);
                    StringJoiner per = new StringJoiner(" / ");
                    int dropped = 0, orphans = 0;
                    for (Moe.Assignment a : r.assignments()) if (!a.kept()) dropped++;
                    for (int t = 0; t < x.size(); t++) {
                        StringJoiner kept = new StringJoiner(",");
                        for (int e = 0; e < w[0].length; e++)
                            for (Moe.Assignment a : r.assignments())
                                if (a.token() == t && a.expert() == e && a.kept())
                                    kept.add((e + 1) + ":" + three(a.weight()));
                        if (kept.length() == 0) orphans++;
                        per.add(kept.length() == 0 ? "-" : kept.toString());
                    }
                    out.append(per).append(" | ").append(dropped).append(' ').append(orphans)
                            .append(" | ").append(three(r.loss())).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
