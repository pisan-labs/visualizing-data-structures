import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** d rows of w counters. Row i uses h_i(x) = ((A[i]*x + B[i]) mod P) mod w. */
public class CountMinSketch {
    private static final int P = 1009; // a prime larger than every item
    private static final int[] A = {71, 113, 157, 211, 263};
    private static final int[] B = {5, 17, 29, 43, 61};

    private final int d;
    private final int w;
    private final int[][] c;

    public CountMinSketch(int d, int w) {
        this.d = d;
        this.w = w;
        this.c = new int[d][w];
    }

    public int rows() {
        return d;
    }

    public int column(int i, int x) {
        return (A[i] * x + B[i]) % P % w;
    }

    public void add(int x) {
        for (int i = 0; i < d; i++) c[i][column(i, x)]++;
    }

    /** Never below the true count; above it when other items share every counter. */
    public int estimate(int x) {
        int min = Integer.MAX_VALUE;
        for (int i = 0; i < d; i++) min = Math.min(min, c[i][column(i, x)]);
        return min;
    }

    /** The candidates whose estimate is at least percent% of the n items added. */
    public List<Integer> heavyHitters(List<Integer> candidates, int n, int percent) {
        List<Integer> hits = new ArrayList<>();
        for (int x : candidates) {
            if (estimate(x) * 100 >= percent * n) hits.add(x);
        }
        hits.sort(Comparator.comparingInt((Integer x) -> -estimate(x)).thenComparingInt(x -> x));
        return hits;
    }
}
