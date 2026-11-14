import java.util.List;

public final class DifferenceArray {
    private DifferenceArray() {}

    /** A copy of a with x added to a[l..r] for every {l, r, x}. O(n + q) for q updates. */
    public static int[] applyUpdates(int[] a, List<int[]> updates) {
        int n = a.length;
        int[] d = new int[n + 1]; // one spare, so r + 1 = n needs no special case
        for (int[] u : updates) {
            d[u[0]] += u[2]; // from l on, everything changes by x
            d[u[1] + 1] -= u[2]; // and from r + 1 on, it stops
        }
        int[] out = new int[n];
        int run = 0;
        for (int i = 0; i < n; i++) {
            run += d[i]; // the total change at i
            out[i] = a[i] + run;
        }
        return out;
    }
}
