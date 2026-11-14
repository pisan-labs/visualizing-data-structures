import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Attention one tile at a time (FlashAttention), and plain attention to compare. */
public class FlashAttention {
    /** O, the running max m and sum l per row, and the numbers moved to and from HBM. */
    public record Result(double[][] o, double[] m, double[] l, long[] moved) {}

    /** Row i's scores q_i . k_j / sqrt(d_k) for the keys j0 <= j < j1 it may see: {j, s} pairs. */
    static List<double[]> scores(double[][] q, double[][] k, int i, int j0, int j1, boolean causal) {
        List<double[]> out = new ArrayList<>();
        for (int j = j0; j < j1; j++) {
            if (causal && j > i) continue; // the mask: a word sees only the words up to it
            double s = 0;
            for (int t = 0; t < q[i].length; t++) s += q[i][t] * k[j][t];
            out.add(new double[] {j, s / Math.sqrt(q[i].length)});
        }
        return out;
    }

    /** The online softmax: fold one tile's scores into row i's running m, l and o. */
    static void update(int i, List<double[]> seen, double[][] v, double[] m, double[] l, double[][] o) {
        double mt = Double.NEGATIVE_INFINITY;
        for (double[] js : seen) mt = Math.max(mt, js[1]);
        double[] p = new double[seen.size()];
        double lt = 0;
        for (int x = 0; x < p.length; x++) {
            p[x] = StrictMath.exp(seen.get(x)[1] - mt);
            lt += p[x];
        }
        double mNew = Math.max(m[i], mt);
        double a = StrictMath.exp(m[i] - mNew), b = StrictMath.exp(mt - mNew); // rescale
        double lNew = a * l[i] + b * lt;
        for (int c = 0; c < o[i].length; c++) {
            double pv = 0;
            for (int x = 0; x < p.length; x++) pv += p[x] * v[(int) seen.get(x)[0]][c];
            o[i][c] = (l[i] * a * o[i][c] + b * pv) / lNew;
        }
        m[i] = mNew;
        l[i] = lNew;
    }

    /** Q in blocks of br rows against K and V in blocks of bc; the table is never stored. */
    public static Result flash(double[][] q, double[][] k, double[][] v, int br, int bc,
            boolean causal, boolean qOutside) {
        int n = q.length, d = v[0].length;
        double[] m = new double[n], l = new double[n];
        Arrays.fill(m, Double.NEGATIVE_INFINITY);
        double[][] o = new double[n][d];
        long[] moved = new long[4]; // Q; K and V; O, m and l; the table
        if (qOutside) { // FlashAttention-2's loop order
            for (int i0 = 0; i0 < n; i0 += br) {
                int i1 = Math.min(n, i0 + br);
                moved[0] += (long) (i1 - i0) * d; // read Q_i
                for (int j0 = 0; j0 < n; j0 += bc) {
                    int j1 = Math.min(n, j0 + bc);
                    if (causal && i1 - 1 < j0) continue; // every score masked: skip
                    moved[1] += 2L * (j1 - j0) * d; // read K_j and V_j
                    tile(q, k, v, i0, i1, j0, j1, causal, m, l, o);
                }
                moved[2] += (long) (i1 - i0) * d; // write O_i
            }
        } else { // the 2022 paper's loop order
            moved[2] += (long) n * d + 2L * n; // O, l and m start in HBM
            for (int j0 = 0; j0 < n; j0 += bc) {
                int j1 = Math.min(n, j0 + bc);
                moved[1] += 2L * (j1 - j0) * d; // read K_j and V_j, once
                for (int i0 = 0; i0 < n; i0 += br) {
                    int i1 = Math.min(n, i0 + br);
                    if (causal && i1 - 1 < j0) continue; // every score masked: skip
                    moved[0] += (long) (i1 - i0) * d; // read Q_i
                    moved[2] += 2L * ((i1 - i0) * d + 2 * (i1 - i0)); // O_i, l_i, m_i in and out
                    tile(q, k, v, i0, i1, j0, j1, causal, m, l, o);
                }
            }
        }
        return new Result(o, m, l, moved);
    }

    static void tile(double[][] q, double[][] k, double[][] v, int i0, int i1, int j0, int j1,
            boolean causal, double[] m, double[] l, double[][] o) {
        for (int i = i0; i < i1; i++) {
            List<double[]> seen = scores(q, k, i, j0, j1, causal);
            if (!seen.isEmpty()) update(i, seen, v, m, l, o);
        }
    }

    /** Plain attention, for comparison: the whole table of scores, then softmax by rows. */
    public static Result plain(double[][] q, double[][] k, double[][] v, boolean causal) {
        int n = q.length, d = v[0].length;
        double[][] o = new double[n][d];
        double[] m = new double[n], l = new double[n];
        for (int i = 0; i < n; i++) {
            double[] row = new double[n];
            Arrays.fill(row, Double.NEGATIVE_INFINITY);
            for (double[] js : scores(q, k, i, 0, n, causal)) row[(int) js[0]] = js[1];
            double mx = Double.NEGATIVE_INFINITY;
            for (double s : row) mx = Math.max(mx, s);
            double[] e = new double[n];
            double total = 0;
            for (int j = 0; j < n; j++) {
                e[j] = StrictMath.exp(row[j] - mx);
                total += e[j];
            }
            for (int c = 0; c < d; c++) {
                double z = 0;
                for (int j = 0; j < n; j++) z += e[j] / total * v[j][c];
                o[i][c] = z;
            }
            m[i] = mx;
            l[i] = total;
        }
        // Q; K and V; O; and S and P, each written to HBM and read back.
        return new Result(o, m, l, new long[] {(long) n * d, 2L * n * d, (long) n * d, 4L * n * n});
    }
}
