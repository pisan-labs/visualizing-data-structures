import java.util.ArrayList;
import java.util.List;

/** The key and value of every token so far, one row each, oldest first. */
public class KVCache {
    private final double[][] wq, wk, wv;
    private final int window; // 0 keeps every token
    private final List<double[]> keys = new ArrayList<>();
    private final List<double[]> values = new ArrayList<>();

    public KVCache(double[][] wq, double[][] wk, double[][] wv, int window) {
        this.wq = wq;
        this.wk = wk;
        this.wv = wv;
        this.window = window;
    }

    public int size() {
        return keys.size();
    }

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

    static double[] row(double[] x, double[][] w) {
        return matmul(new double[][] {x}, w)[0];
    }

    /** One query against the keys it may see: scaled scores, softmax, a blend of the values. */
    static double[] attend(double[] q, List<double[]> keys, List<double[]> values) {
        int m = keys.size(), dk = q.length;
        double[] a = new double[m];
        double max = Double.NEGATIVE_INFINITY;
        for (int j = 0; j < m; j++) {
            double s = 0;
            for (int t = 0; t < dk; t++) s += q[t] * keys.get(j)[t];
            a[j] = s / Math.sqrt(dk);
            max = Math.max(max, a[j]);
        }
        double total = 0;
        for (int j = 0; j < m; j++) {
            a[j] = StrictMath.exp(a[j] - max); // softmax, largest score subtracted first
            total += a[j];
        }
        for (int j = 0; j < m; j++) a[j] /= total;
        double[] z = new double[values.get(0).length];
        for (int c = 0; c < z.length; c++) {
            double s = 0;
            for (int j = 0; j < m; j++) s += a[j] * values.get(j)[c];
            z[c] = s;
        }
        return z;
    }

    private void append(double[] k, double[] v) {
        keys.add(k);
        values.add(v);
        if (window > 0 && keys.size() > window) { // evict the oldest
            keys.remove(0);
            values.remove(0);
        }
    }

    /** The whole prompt at once. Returns every prompt token's output. */
    public double[][] prefill(double[][] xs) {
        double[][] q = matmul(xs, wq), k = matmul(xs, wk), v = matmul(xs, wv);
        double[][] out = new double[xs.length][];
        for (int i = 0; i < xs.length; i++) {
            int lo = window > 0 ? Math.max(0, i + 1 - window) : 0; // tokens lo..i only
            out[i] = attend(q[i], List.of(k).subList(lo, i + 1), List.of(v).subList(lo, i + 1));
        }
        for (int i = 0; i < xs.length; i++) append(k[i], v[i]);
        return out;
    }

    /** One new token: one new row of K and one of V, then attend over the cache. */
    public double[] decode(double[] x) {
        append(row(x, wk), row(x, wv));
        return attend(row(x, wq), keys, values);
    }

    /** The last token's output, computing the key and value of every token it sees again. */
    public static double[] decodeWithoutCache(
            List<double[]> xs, double[][] wq, double[][] wk, double[][] wv, int window) {
        int lo = window > 0 ? Math.max(0, xs.size() - window) : 0;
        double[][] seen = xs.subList(lo, xs.size()).toArray(new double[0][]);
        List<double[]> keys = List.of(matmul(seen, wk)), values = List.of(matmul(seen, wv));
        return attend(row(xs.get(xs.size() - 1), wq), keys, values);
    }
}
