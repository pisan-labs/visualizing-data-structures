/**
 * A frozen d x d matrix W plus a trainable low-rank update (alpha / r) * B * A. B is d x r and
 * starts at zero; A is r x d and starts small and random, so the update starts at zero and the
 * layer starts unchanged.
 */
public class LoRA {
    static final double BETA1 = 0.9, BETA2 = 0.999, EPS = 1e-8;

    final double[][] w; // frozen: never trained
    final double[][] b, a; // the only trained numbers: 2 * d * r of them
    final double scale, lr;
    final double[][] mb, vb, ma, va; // Adam's averages for B and for A
    double p1 = 1, p2 = 1; // beta1^t and beta2^t

    LoRA(double[][] w, double[][] b, double[][] a, double alpha, double lr) {
        this.w = w;
        this.b = b;
        this.a = a;
        this.scale = alpha / a.length; // alpha / r
        this.lr = lr;
        mb = new double[b.length][b[0].length];
        vb = new double[b.length][b[0].length];
        ma = new double[a.length][a[0].length];
        va = new double[a.length][a[0].length];
    }

    static double[][] matmul(double[][] x, double[][] y) {
        double[][] out = new double[x.length][y[0].length];
        for (int i = 0; i < x.length; i++)
            for (int j = 0; j < y[0].length; j++) {
                double s = 0;
                for (int t = 0; t < y.length; t++) s += x[i][t] * y[t][j];
                out[i][j] = s;
            }
        return out;
    }

    /** The update the adapter adds to W. */
    double[][] delta() {
        double[][] p = matmul(b, a);
        for (double[] row : p)
            for (int j = 0; j < row.length; j++) row[j] = scale * row[j];
        return p;
    }

    /** Sum of squared differences between the update and the target update. */
    double loss(double[][] target) {
        double[][] dw = delta();
        double total = 0;
        for (int i = 0; i < dw.length; i++)
            for (int j = 0; j < dw[i].length; j++) {
                double e = dw[i][j] - target[i][j];
                total += e * e;
            }
        return total;
    }

    void trainStep(double[][] target) {
        int d = b.length, r = a.length;
        double[][] g = delta();
        for (int i = 0; i < d; i++)
            for (int j = 0; j < d; j++) g[i][j] = 2 * (g[i][j] - target[i][j]);
        double[][] gb = new double[d][r]; // dLoss/dB = scale * g * A^T
        for (int i = 0; i < d; i++)
            for (int k = 0; k < r; k++) {
                double s = 0;
                for (int j = 0; j < d; j++) s += g[i][j] * a[k][j];
                gb[i][k] = scale * s;
            }
        double[][] ga = new double[r][d]; // dLoss/dA = scale * B^T * g
        for (int k = 0; k < r; k++)
            for (int j = 0; j < d; j++) {
                double s = 0;
                for (int i = 0; i < d; i++) s += b[i][k] * g[i][j];
                ga[k][j] = scale * s;
            }
        p1 *= BETA1;
        p2 *= BETA2;
        adam(b, gb, mb, vb);
        adam(a, ga, ma, va);
    }

    void adam(double[][] p, double[][] g, double[][] m, double[][] v) {
        for (int i = 0; i < p.length; i++)
            for (int j = 0; j < p[i].length; j++) {
                m[i][j] = BETA1 * m[i][j] + (1 - BETA1) * g[i][j];
                v[i][j] = BETA2 * v[i][j] + (1 - BETA2) * g[i][j] * g[i][j];
                double mh = m[i][j] / (1 - p1), vh = v[i][j] / (1 - p2);
                p[i][j] -= lr * mh / (StrictMath.sqrt(vh) + EPS);
            }
    }

    /** W + update: one matrix again, so serving costs what it did before. */
    double[][] merge() {
        double[][] dw = delta();
        double[][] out = new double[w.length][w[0].length];
        for (int i = 0; i < w.length; i++)
            for (int j = 0; j < w[i].length; j++) out[i][j] = w[i][j] + dw[i][j];
        return out;
    }
}
