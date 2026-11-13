import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.DoubleSupplier;

/** k-means with Lloyd's algorithm, on points {x, y}. */
public class KMeans {
    public record Result(double[][] centres, int[] labels, int rounds) {}

    static double dist2(double[] a, double[] b) {
        double dx = a[0] - b[0], dy = a[1] - b[1];
        return dx * dx + dy * dy;
    }

    /** Index of the centre nearest to p; a tie goes to the lower index. */
    static int nearest(double[] p, double[][] centres) {
        int best = 0;
        for (int j = 1; j < centres.length; j++)
            if (dist2(p, centres[j]) < dist2(p, centres[best])) best = j;
        return best;
    }

    public static int[] assign(double[][] points, double[][] centres) {
        int[] labels = new int[points.length];
        for (int i = 0; i < points.length; i++) labels[i] = nearest(points[i], centres);
        return labels;
    }

    /**
     * Move each centre to the mean of its points. A centre with no points jumps to the point
     * farthest from its own centre ("farthest") or stays put ("stay").
     */
    public static double[][] update(double[][] points, int[] labels, double[][] centres, String empty) {
        double[][] next = centres.clone();
        List<Integer> empties = new ArrayList<>();
        for (int j = 0; j < centres.length; j++) {
            double sx = 0, sy = 0;
            int n = 0;
            for (int i = 0; i < points.length; i++)
                if (labels[i] == j) {
                    sx += points[i][0];
                    sy += points[i][1];
                    n++;
                }
            if (n == 0) empties.add(j);
            else next[j] = new double[] {sx / n, sy / n};
        }
        Set<Integer> taken = new HashSet<>();
        for (int j : empties) {
            if (!empty.equals("farthest")) continue;
            int far = -1;
            double farD = 0;
            for (int i = 0; i < points.length; i++) {
                double d = dist2(points[i], next[labels[i]]);
                if (!taken.contains(i) && d > farD) {
                    far = i;
                    farD = d;
                }
            }
            if (far >= 0) { // if every point sits on its centre, stay put
                taken.add(far);
                next[j] = points[far];
            }
        }
        return next;
    }

    /** Within-cluster sum of squares: what Lloyd's algorithm makes smaller. */
    public static double wcss(double[][] points, int[] labels, double[][] centres) {
        double total = 0;
        for (int i = 0; i < points.length; i++) total += dist2(points[i], centres[labels[i]]);
        return total;
    }

    /** k different points, each equally likely. rand gives uniform numbers in [0, 1). */
    public static int[] randomSeeds(double[][] points, int k, DoubleSupplier rand) {
        List<Integer> pool = new ArrayList<>();
        for (int i = 0; i < points.length; i++) pool.add(i);
        int[] chosen = new int[k];
        for (int c = 0; c < k; c++) chosen[c] = pool.remove((int) (rand.getAsDouble() * pool.size()));
        return chosen;
    }

    /**
     * k-means++ seeding (Arthur and Vassilvitskii 2007): after a uniform first centre, each
     * point x is picked with probability D(x)^2 / (sum of all D^2).
     */
    public static int[] kmeansPP(double[][] points, int k, DoubleSupplier rand) {
        int n = points.length;
        int[] chosen = new int[k];
        chosen[0] = (int) (rand.getAsDouble() * n);
        boolean[] used = new boolean[n];
        used[chosen[0]] = true;
        double[] d2 = new double[n];
        for (int i = 0; i < n; i++) d2[i] = dist2(points[i], points[chosen[0]]);
        for (int c = 1; c < k; c++) {
            double u = rand.getAsDouble();
            double total = 0;
            for (double x : d2) total += x;
            int pick = 0;
            if (total == 0) { // every point sits on a centre: draw uniformly
                List<Integer> pool = new ArrayList<>();
                for (int i = 0; i < n; i++) if (!used[i]) pool.add(i);
                pick = pool.get((int) (u * pool.size()));
            } else {
                double target = u * total, run = 0;
                for (int i = 0; i < n; i++) {
                    run += d2[i];
                    if (run > target) {
                        pick = i;
                        break;
                    }
                }
            }
            chosen[c] = pick;
            used[pick] = true;
            for (int i = 0; i < n; i++) d2[i] = Math.min(d2[i], dist2(points[i], points[pick]));
        }
        return chosen;
    }

    /** Assign and update until an assignment changes nothing (labels may be null). */
    public static Result lloyd(double[][] points, double[][] centres, int[] labels, String empty, int maxRounds) {
        for (int rounds = 1; rounds <= maxRounds; rounds++) {
            int[] next = assign(points, centres);
            if (Arrays.equals(next, labels)) return new Result(centres, labels, rounds);
            labels = next;
            centres = update(points, labels, centres, empty);
        }
        return new Result(centres, labels, maxRounds);
    }
}
