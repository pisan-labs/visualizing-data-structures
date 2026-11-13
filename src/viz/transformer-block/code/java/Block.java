import java.util.Map;

/** One transformer block (pre- or post-norm), then the unembedding, following the last word. */
public class Block {
    static final double EPS = 1e-5;

    /** The last word's attention weights, the stream after each sublayer, and the logits. */
    public record Result(double[] a, double[] x1, double[] x2, double[] logits) {}

    /** a (n x m) times b (m x p), each sum in index order. */
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

    static double[] times(double[] v, double[][] m) {
        return matmul(new double[][] {v}, m)[0];
    }

    static double[] add(double[] a, double[] b) {
        double[] out = new double[a.length];
        for (int i = 0; i < a.length; i++) out[i] = a[i] + b[i];
        return out;
    }

    /** LayerNorm or RMSNorm with gamma = 1 and beta = 0. */
    static double[] norm(double[] v, String kind) {
        int d = v.length;
        double mean = 0, q = 0;
        if (kind.equals("layer")) {
            double s = 0;
            for (double x : v) s += x;
            mean = s / d;
            for (double x : v) q += (x - mean) * (x - mean);
        } else {
            for (double x : v) q += x * x;
        }
        double scale = Math.sqrt(q / d + EPS);
        double[] out = new double[d];
        for (int i = 0; i < d; i++) out[i] = (v[i] - mean) / scale;
        return out;
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

    static double gelu(double x) {
        return 0.5 * x * (1 + StrictMath.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
    }

    static double silu(double x) {
        return x / (1 + StrictMath.exp(-x));
    }

    static double[] feedForward(double[] v, Map<String, double[][]> w, String act) {
        if (act.equals("swiglu")) {
            double[] g = times(v, w.get("wg")), u = times(v, w.get("wu"));
            double[] h = new double[g.length];
            for (int i = 0; i < g.length; i++) h[i] = silu(g[i]) * u[i];
            return times(h, w.get("wd"));
        }
        double[] g = add(times(v, w.get("w1")), w.get("b1")[0]);
        double[] h = new double[g.length];
        for (int i = 0; i < g.length; i++) h[i] = act.equals("relu") ? (g[i] > 0 ? g[i] : 0) : gelu(g[i]);
        return add(times(h, w.get("w2")), w.get("b2")[0]);
    }

    public static Result block(double[][] x, Map<String, double[][]> w, String order, String kind,
            String act) {
        int n = x.length, last = n - 1;
        double[][] in = x;
        if (order.equals("pre")) {
            in = new double[n][];
            for (int i = 0; i < n; i++) in[i] = norm(x[i], kind);
        }
        // One causal head: the last word's query against every key.
        double[][] q = matmul(in, w.get("q")), k = matmul(in, w.get("k")), v = matmul(in, w.get("v"));
        int dk = q[0].length;
        double[][] a = new double[n][];
        for (int i = 0; i < n; i++) {
            double[] scores = new double[n];
            for (int j = 0; j < n; j++) {
                double s = 0;
                for (int t = 0; t < dk; t++) s += q[i][t] * k[j][t];
                scores[j] = j <= i ? s / Math.sqrt(dk) : Double.NEGATIVE_INFINITY;
            }
            a[i] = softmax(scores);
        }
        double[] attn = matmul(matmul(a, v), w.get("o"))[last];
        double[] x1, x2, h;
        if (order.equals("pre")) {
            x1 = add(x[last], attn); // x1 = x + attn(norm(x))
            x2 = add(x1, feedForward(norm(x1, kind), w, act)); // x2 = x1 + ffn(norm(x1))
            h = norm(x2, kind); // the final norm
        } else {
            x1 = norm(add(x[last], attn), kind); // x1 = norm(x + attn(x))
            x2 = norm(add(x1, feedForward(x1, w, act)), kind); // x2 = norm(x1 + ffn(x1))
            h = x2;
        }
        return new Result(a[last], x1, x2, times(h, w.get("u")));
    }
}
