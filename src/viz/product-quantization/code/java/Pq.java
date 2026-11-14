import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Product quantization: m codebooks of k centres, one per piece of the vector. */
public class Pq {
    final int m, k;
    double[][][] books; // books[j][c]: centre c of piece j

    Pq(int m, int k) {
        this.m = m;
        this.k = k;
    }

    static double dist2(double[] a, double[] b) {
        double total = 0;
        for (int i = 0; i < a.length; i++) {
            double d = a[i] - b[i];
            total += d * d;
        }
        return total;
    }

    /** Index of the centre nearest to p; a tie goes to the lower index. */
    static int nearest(double[] p, double[][] centres) {
        int best = 0;
        for (int j = 1; j < centres.length; j++)
            if (dist2(p, centres[j]) < dist2(p, centres[best])) best = j;
        return best;
    }

    /** k-means++ seeding, one uniform number in [0, 1) per centre. */
    static int[] kmeansPP(double[][] points, double[] draws) {
        int n = points.length;
        List<Integer> chosen = new ArrayList<>();
        for (double u : draws) {
            if (!chosen.isEmpty()) {
                double[] d2 = new double[n];
                double total = 0;
                for (int i = 0; i < n; i++) {
                    d2[i] = Double.POSITIVE_INFINITY;
                    for (int j : chosen) d2[i] = Math.min(d2[i], dist2(points[i], points[j]));
                    total += d2[i];
                }
                if (total > 0) {
                    double run = 0;
                    for (int i = 0; i < n; i++) {
                        run += d2[i];
                        if (run > u * total) {
                            chosen.add(i);
                            break;
                        }
                    }
                    continue;
                }
            }
            List<Integer> pool = new ArrayList<>();
            for (int i = 0; i < n; i++) if (!chosen.contains(i)) pool.add(i);
            chosen.add(pool.get((int) (u * pool.size())));
        }
        return chosen.stream().mapToInt(Integer::intValue).toArray();
    }

    /** Each centre to the mean of its points; one with no points jumps to the farthest point. */
    static double[][] update(double[][] points, int[] labels, double[][] centres) {
        double[][] next = new double[centres.length][];
        List<Integer> empties = new ArrayList<>();
        for (int j = 0; j < centres.length; j++) {
            double[] s = new double[centres[j].length];
            int n = 0;
            for (int i = 0; i < points.length; i++)
                if (labels[i] == j) {
                    for (int c = 0; c < s.length; c++) s[c] += points[i][c];
                    n++;
                }
            if (n == 0) {
                next[j] = centres[j].clone();
                empties.add(j);
            } else {
                for (int c = 0; c < s.length; c++) s[c] /= n;
                next[j] = s;
            }
        }
        Set<Integer> taken = new HashSet<>();
        for (int j : empties) {
            int far = -1;
            double farD = 0;
            for (int i = 0; i < points.length; i++) {
                double d = dist2(points[i], next[labels[i]]);
                if (!taken.contains(i) && d > farD) {
                    far = i;
                    farD = d;
                }
            }
            if (far >= 0) {
                taken.add(far);
                next[j] = points[far].clone();
            }
        }
        return next;
    }

    /** Lloyd's algorithm: assign, move, until no point changes cluster. */
    static double[][] kmeans(double[][] points, double[][] centres, int maxRounds) {
        int[] labels = null;
        for (int round = 0; round < maxRounds; round++) {
            int[] next = new int[points.length];
            for (int i = 0; i < points.length; i++) next[i] = nearest(points[i], centres);
            if (Arrays.equals(next, labels)) break;
            labels = next;
            centres = update(points, labels, centres);
        }
        return centres;
    }

    double[] piece(double[] v, int j) {
        int w = v.length / m;
        return Arrays.copyOfRange(v, j * w, (j + 1) * w);
    }

    /** k-means on each piece; draws holds k numbers per piece for k-means++. */
    void train(double[][] vectors, double[] draws) {
        books = new double[m][][];
        for (int j = 0; j < m; j++) {
            double[][] sub = new double[vectors.length][];
            for (int i = 0; i < vectors.length; i++) sub[i] = piece(vectors[i], j);
            int[] seeds = kmeansPP(sub, Arrays.copyOfRange(draws, j * k, (j + 1) * k));
            double[][] start = new double[k][];
            for (int c = 0; c < k; c++) start[c] = sub[seeds[c]].clone();
            books[j] = kmeans(sub, start, 20);
        }
    }

    /** The code: the nearest centre of each piece. */
    int[] encode(double[] v) {
        int[] code = new int[m];
        for (int j = 0; j < m; j++) code[j] = nearest(piece(v, j), books[j]);
        return code;
    }

    /** table[j][c]: d² from the query's piece j to centre c of codebook j. */
    double[][] table(double[] q) {
        double[][] t = new double[m][k];
        for (int j = 0; j < m; j++)
            for (int c = 0; c < k; c++) t[j][c] = dist2(piece(q, j), books[j][c]);
        return t;
    }

    /** Asymmetric distance to every code, by table lookups. */
    double[] distances(double[] q, int[][] codes) {
        double[][] t = table(q);
        double[] out = new double[codes.length];
        for (int i = 0; i < codes.length; i++) {
            double total = 0;
            for (int j = 0; j < m; j++) total += t[j][codes[i][j]];
            out[i] = total;
        }
        return out;
    }

    /** The k smallest distances' indices, a tie to the lower index. */
    static int[] nearestK(double[] dists, int k) {
        Integer[] order = new Integer[dists.length];
        for (int i = 0; i < order.length; i++) order[i] = i;
        Arrays.sort(order, Comparator.<Integer>comparingDouble(i -> dists[i]).thenComparingInt(i -> i));
        int[] out = new int[Math.min(k, order.length)];
        for (int i = 0; i < out.length; i++) out[i] = order[i];
        return out;
    }
}
