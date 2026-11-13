import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "clear" starts a
 * sentence and "x q1 q2 k1 k2" adds a word's query and key; neither prints. "encode
 * sinusoidal|rope|alibi" prints the encodings, the angles or the biases (ALiBi: each row up to
 * the diagonal); "score sinusoidal|rope|alibi" prints PE(m)·PE(n), the turned q_m·k_n, or
 * ALiBi's attention weights. Rows are separated by slashes, three decimals each.
 */
public class Main {
    static final int D = 8; // four pairs
    static final double SLOPE = 0.5;

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

    /** The same pair in each of the four pairs. */
    static double[] spread(double a, double b) {
        double[] v = new double[D];
        for (int i = 0; i < D / 2; i++) {
            v[2 * i] = a;
            v[2 * i + 1] = b;
        }
        return v;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<double[]> q = new ArrayList<>(), k = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            int n = q.size();
            switch (p[0]) {
                case "clear" -> {
                    q.clear();
                    k.clear();
                }
                case "x" -> {
                    q.add(new double[] {Double.parseDouble(p[1]), Double.parseDouble(p[2])});
                    k.add(new double[] {Double.parseDouble(p[3]), Double.parseDouble(p[4])});
                }
                case "encode" -> {
                    double[][] t;
                    if (p[1].equals("sinusoidal")) {
                        t = Positions.sinusoidal(n, D);
                    } else {
                        boolean rope = p[1].equals("rope");
                        t = new double[n][];
                        for (int i = 0; i < n; i++) {
                            t[i] = new double[rope ? D / 2 : i + 1];
                            for (int j = 0; j < t[i].length; j++)
                                t[i][j] = rope ? Positions.angle(i, j, D) : -SLOPE * (i - j);
                        }
                    }
                    out.append(rows(t)).append('\n');
                }
                case "score" -> {
                    double[][] s;
                    if (p[1].equals("sinusoidal")) {
                        double[][] pe = Positions.sinusoidal(n, D);
                        s = new double[n][n];
                        for (int a = 0; a < n; a++)
                            for (int b = 0; b < n; b++) s[a][b] = Positions.dot(pe[a], pe[b]);
                    } else if (p[1].equals("rope")) {
                        double[][] qs = new double[n][], ks = new double[n][];
                        for (int i = 0; i < n; i++) {
                            qs[i] = spread(q.get(i)[0], q.get(i)[1]);
                            ks[i] = spread(k.get(i)[0], k.get(i)[1]);
                        }
                        s = Positions.ropeScores(qs, ks);
                    } else {
                        s = Positions.alibiAttention(
                                q.toArray(new double[0][]), k.toArray(new double[0][]), SLOPE);
                    }
                    out.append(rows(s)).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
