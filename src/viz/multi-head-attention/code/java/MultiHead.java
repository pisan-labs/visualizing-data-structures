/** Causal attention with h query heads and h_kv key/value heads (MHA, GQA, MQA). */
public class MultiHead {
    /** Each head's weights (one table per head) and the output O. */
    public record Result(double[][][] a, double[][] o) {}

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

    /**
     * wq is d_model x d_model, cut into h heads of d = d_model / h columns. wk and wv are
     * d_model x (hKv * d): one block of d columns per key/value head. Query head i reads
     * key/value head i / (h / hKv): hKv = h is multi-head attention, hKv = 1 multi-query.
     */
    public static Result multiHead(double[][] x, double[][] wq, double[][] wk, double[][] wv,
            double[][] wo, int h, int hKv) {
        double[][] q = matmul(x, wq), k = matmul(x, wk), v = matmul(x, wv);
        int n = x.length, d = wq[0].length / h, group = h / hKv;
        double[][][] a = new double[h][n][];
        double[][] z = new double[n][h * d];
        for (int i = 0; i < h; i++) {
            int g = i / group; // the key/value head this query head reads
            for (int r = 0; r < n; r++) {
                double[] scores = new double[n];
                for (int c = 0; c < n; c++) {
                    double s = 0;
                    for (int t = 0; t < d; t++) s += q[r][i * d + t] * k[c][g * d + t];
                    scores[c] = c <= r ? s / Math.sqrt(d) : Double.NEGATIVE_INFINITY;
                }
                a[i][r] = softmax(scores);
            }
            for (int r = 0; r < n; r++) // this head's output goes next to the others
                for (int t = 0; t < d; t++) {
                    double s = 0;
                    for (int c = 0; c < n; c++) s += a[i][r][c] * v[c][g * d + t];
                    z[r][i * d + t] = s;
                }
        }
        return new Result(a, matmul(z, wo));
    }
}
