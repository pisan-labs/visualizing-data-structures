/** One head of scaled dot-product attention. */
public class Attention {
    /** The weights A (one row per word) and the outputs Z. */
    public record Result(double[][] a, double[][] z) {}

    /** a (n x m) times b (m x p). */
    static double[][] matmul(double[][] a, double[][] b) {
        double[][] out = new double[a.length][b[0].length];
        for (int i = 0; i < a.length; i++)
            for (int j = 0; j < b[0].length; j++) {
                double s = 0;
                for (int t = 0; t < b.length; t++) s += a[i][t] * b[t][j];
                out[i][j] = s;
            }
        return out;
    }

    /** Weights that add up to 1. Subtracting the largest score keeps exp from overflowing. */
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

    /** x holds one row per word; wq, wk and wv turn a row into its query, key and value. */
    public static Result selfAttention(
            double[][] x, double[][] wq, double[][] wk, double[][] wv,
            boolean causal, boolean scale) {
        double[][] q = matmul(x, wq), k = matmul(x, wk), v = matmul(x, wv);
        int n = x.length, dk = wq[0].length;
        double[][] a = new double[n][];
        for (int i = 0; i < n; i++) {
            double[] scores = new double[n];
            for (int j = 0; j < n; j++) {
                double s = 0;
                for (int t = 0; t < dk; t++) s += q[i][t] * k[j][t]; // q_i . k_j
                if (scale) s /= Math.sqrt(dk);
                if (causal && j > i) s = Double.NEGATIVE_INFINITY; // no peeking ahead
                scores[j] = s;
            }
            a[i] = softmax(scores);
        }
        return new Result(a, matmul(a, v));
    }
}
