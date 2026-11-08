/**
 * A bitonic sorting network. The comparators do not depend on the values, so each inner loop
 * over i could run all at once in parallel.
 */
public final class BitonicSort {
    private BitonicSort() { }

    /** Sorts a in place; a.length must be a power of two. */
    public static void sort(int[] a) {
        int n = a.length;
        if ((n & (n - 1)) != 0) {
            throw new IllegalArgumentException("n must be a power of two");
        }
        for (int size = 2; size <= n; size *= 2) {
            // Flip: each value in the first half of a block meets its mirror.
            for (int i = 0; i < n; i++) {
                compare(a, i, i ^ (size - 1));
            }
            // Half-cleaners: compare values d apart, d = size/4, ..., 1.
            for (int d = size / 4; d >= 1; d /= 2) {
                for (int i = 0; i < n; i++) {
                    compare(a, i, i ^ d);
                }
            }
        }
    }

    /** A comparator: the smaller value ends up at the lower index. */
    private static void compare(int[] a, int i, int j) {
        if (j > i && a[i] > a[j]) {
            int t = a[i];
            a[i] = a[j];
            a[j] = t;
        }
    }
}
