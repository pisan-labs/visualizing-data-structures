import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** An inverted file index (IVF) on points {x, y}: one list of points per k-means centre. */
public class Ivf {
    public record Result(int[] ids, int distances) {}

    final double[][] points;
    final double[][] centres;
    final List<List<Integer>> lists = new ArrayList<>();

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

    /** Each centre to the mean of its points; one with no points jumps to the farthest point. */
    static double[][] move(double[][] points, int[] labels, double[][] centres) {
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
                next[j] = points[far];
            }
        }
        return next;
    }

    /** Lloyd's algorithm from the starting centres (here, k-means++ picks them). */
    public static double[][] kmeans(double[][] points, double[][] centres, int maxRounds) {
        int[] labels = null;
        for (int round = 0; round < maxRounds; round++) {
            int[] next = new int[points.length];
            for (int i = 0; i < points.length; i++) next[i] = nearest(points[i], centres);
            if (Arrays.equals(next, labels)) break;
            labels = next;
            centres = move(points, labels, centres);
        }
        return centres;
    }

    public Ivf(double[][] points, double[][] centres) {
        this.points = points;
        this.centres = centres;
        for (int j = 0; j < centres.length; j++) lists.add(new ArrayList<>());
        for (int i = 0; i < points.length; i++) lists.get(nearest(points[i], centres)).add(i);
    }

    /** The k nearest points in the nprobe lists whose centres are nearest to q. */
    public Result search(double[] q, int k, int nprobe) {
        double[] d = new double[centres.length];
        Integer[] order = new Integer[centres.length];
        for (int j = 0; j < centres.length; j++) {
            d[j] = dist2(q, centres[j]);
            order[j] = j;
        }
        Arrays.sort(order, Comparator.<Integer>comparingDouble(j -> d[j]).thenComparingInt(j -> j));
        int count = centres.length;
        List<double[]> found = new ArrayList<>(); // {d², index}
        for (int r = 0; r < Math.min(nprobe, order.length); r++)
            for (int i : lists.get(order[r])) {
                found.add(new double[] {dist2(q, points[i]), i});
                count++;
            }
        found.sort(Comparator.<double[]>comparingDouble(e -> e[0]).thenComparingDouble(e -> e[1]));
        int[] ids = new int[Math.min(k, found.size())];
        for (int r = 0; r < ids.length; r++) ids[r] = (int) found.get(r)[1];
        return new Result(ids, count);
    }
}
