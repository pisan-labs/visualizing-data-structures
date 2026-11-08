public class MatrixChain {
    /**
     * Fills m and s for matrices A1..An, where Ak is p[k-1] x p[k]. m[i][j] is the fewest scalar
     * multiplications for A(i+1)..A(j+1); s[i][j] is the split k (1-based). Returns {m, s}.
     */
    public static long[][][] order(int[] p) {
        int n = p.length - 1;
        long[][] m = new long[n][n];
        long[][] s = new long[n][n];
        for (int len = 2; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                m[i][j] = Long.MAX_VALUE;
                for (int k = i + 1; k <= j; k++) {
                    long q = m[i][k - 1] + m[k][j] + (long) p[i] * p[k] * p[j + 1];
                    if (q < m[i][j]) {
                        m[i][j] = q;
                        s[i][j] = k;
                    }
                }
            }
        }
        return new long[][][] {m, s};
    }

    /** The best order for A(i+1)..A(j+1) as nested brackets. */
    public static String parens(long[][] s, int i, int j) {
        if (i == j) {
            return "A" + (i + 1);
        }
        int k = (int) s[i][j];
        return "(" + parens(s, i, k - 1) + parens(s, k, j) + ")";
    }
}
