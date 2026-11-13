/** Three ways to give attention positions: sinusoidal encodings, RoPE and ALiBi. */
public class Positions {
    static final double BASE = 10000;

    /** Pair i turns pos / 10000^(2i/d) radians: each pair slower than the last. */
    static double angle(int pos, int i, int d) {
        return pos / StrictMath.pow(BASE, 2.0 * i / d);
    }

    /** Vaswani et al.: row pos is sin, cos of each pair's angle, added to the embedding. */
    public static double[][] sinusoidal(int n, int d) {
        double[][] pe = new double[n][d];
        for (int pos = 0; pos < n; pos++)
            for (int i = 0; i < d / 2; i++) {
                pe[pos][2 * i] = StrictMath.sin(angle(pos, i, d));
                pe[pos][2 * i + 1] = StrictMath.cos(angle(pos, i, d));
            }
        return pe;
    }

    /** RoPE: turn each pair (v[2i], v[2i+1]) of a query or key by its angle at pos. */
    public static double[] rotate(double[] v, int pos) {
        double[] out = new double[v.length];
        for (int i = 0; i < v.length / 2; i++) {
            double a = angle(pos, i, v.length);
            double x = v[2 * i], y = v[2 * i + 1];
            out[2 * i] = x * StrictMath.cos(a) - y * StrictMath.sin(a);
            out[2 * i + 1] = x * StrictMath.sin(a) + y * StrictMath.cos(a);
        }
        return out;
    }

    static double dot(double[] a, double[] b) {
        double s = 0;
        for (int t = 0; t < a.length; t++) s += a[t] * b[t];
        return s;
    }

    /** Every query against every key, each turned by its own position. */
    public static double[][] ropeScores(double[][] q, double[][] k) {
        double[][] s = new double[q.length][k.length];
        for (int m = 0; m < q.length; m++)
            for (int n = 0; n < k.length; n++) s[m][n] = dot(rotate(q[m], m), rotate(k[n], n));
        return s;
    }

    static double[] softmax(double[] scores) {
        double m = Double.NEGATIVE_INFINITY;
        for (double s : scores) m = Math.max(m, s);
        double[] e = new double[scores.length];
        double total = 0;
        for (int j = 0; j < scores.length; j++) {
            e[j] = StrictMath.exp(scores[j] - m);
            total += e[j];
        }
        for (int j = 0; j < e.length; j++) e[j] /= total;
        return e;
    }

    /**
     * Press et al.: no position vectors; the score of query i for key j gets -slope * (i - j),
     * and keys after the query are masked.
     */
    public static double[][] alibiAttention(double[][] q, double[][] k, double slope) {
        int n = q.length;
        double[][] a = new double[n][];
        for (int i = 0; i < n; i++) {
            double[] scores = new double[n];
            for (int j = 0; j < n; j++)
                scores[j] = j <= i
                        ? dot(q[i], k[j]) / Math.sqrt(q[i].length) + -slope * (i - j)
                        : Double.NEGATIVE_INFINITY;
            a[i] = softmax(scores);
        }
        return a;
    }
}
