/** Range sums: P[k] is the sum of the first k values, A[0..k). */
class PrefixSums {
    private final int[] a;
    private final long[] p;

    PrefixSums(int[] values) {
        a = values.clone();
        p = new long[a.length + 1];
        for (int k = 0; k < a.length; k++) {
            p[k + 1] = p[k] + a[k];
        }
    }

    /** A[i] + ... + A[j], both ends included. O(1). */
    long sum(int i, int j) {
        return p[j + 1] - p[i];
    }

    /** Set A[i] to x. Every prefix that includes A[i] changes: O(n). */
    void update(int i, int x) {
        int d = x - a[i];
        a[i] = x;
        for (int k = i + 1; k < p.length; k++) {
            p[k] += d;
        }
    }
}

/** Range minimums: m[k][i] is the smallest of A[i .. i + 2^k - 1]. */
class SparseTable {
    private final int[][] m;

    SparseTable(int[] a) {
        int levels = 32 - Integer.numberOfLeadingZeros(a.length);
        m = new int[levels][];
        m[0] = a.clone();
        for (int k = 1; k < levels; k++) {
            int half = 1 << (k - 1);
            m[k] = new int[a.length - (1 << k) + 1];
            for (int i = 0; i < m[k].length; i++) {
                m[k][i] = Math.min(m[k - 1][i], m[k - 1][i + half]);
            }
        }
    }

    /** The smallest of A[i..j], from two windows that may overlap. O(1). */
    int min(int i, int j) {
        int k = 31 - Integer.numberOfLeadingZeros(j - i + 1);
        return Math.min(m[k][i], m[k][j - (1 << k) + 1]);
    }

    /** Set A[i] to x and recompute every window that contains i: O(n). */
    void update(int i, int x) {
        m[0][i] = x;
        int n = m[0].length;
        for (int k = 1; k < m.length; k++) {
            int half = 1 << (k - 1);
            for (int t = Math.max(0, i - (1 << k) + 1); t <= Math.min(i, n - (1 << k)); t++) {
                m[k][t] = Math.min(m[k - 1][t], m[k - 1][t + half]);
            }
        }
    }
}
