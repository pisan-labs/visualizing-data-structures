/** Prefix sums that allow updates. 1-based: t[i] holds A[i - (i & -i) + 1] + ... + A[i]. */
public class FenwickTree {
    private final long[] t;

    /** Build in O(n): copy A, then pass each t[i] up to the next range that contains it. */
    public FenwickTree(int[] values) {
        t = new long[values.length + 1];
        for (int i = 1; i < t.length; i++) {
            t[i] = values[i - 1];
        }
        for (int i = 1; i < t.length; i++) {
            int j = i + (i & -i);
            if (j < t.length) {
                t[j] += t[i];
            }
        }
    }

    /** A[i] += delta. Every range that contains i changes: O(log n). */
    public void add(int i, long delta) {
        for (; i < t.length; i += i & -i) {
            t[i] += delta;
        }
    }

    /** A[1] + ... + A[i]: one range per 1 bit of i, O(log n). */
    public long prefix(int i) {
        long total = 0;
        for (; i > 0; i -= i & -i) {
            total += t[i];
        }
        return total;
    }

    /** A[l] + ... + A[r], both ends included. */
    public long sum(int l, int r) {
        return prefix(r) - prefix(l - 1);
    }
}
