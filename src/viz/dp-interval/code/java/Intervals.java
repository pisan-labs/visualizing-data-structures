import java.util.ArrayList;
import java.util.List;

public final class Intervals {
    private Intervals() {}

    /** The best total and the order the tiles are taken, by position from 1. */
    public record Removal(long best, List<Integer> order) {}

    /** The least cost and the merges as brackets of pile sizes. */
    public record Merging(long cost, String tree) {}

    /**
     * Best total for taking every tile, each scoring itself times its two current neighbours
     * (the ends count as 1).
     */
    public static Removal bestRemoval(int[] tiles) {
        int n = tiles.length;
        long[] v = new long[n + 2]; // v[1..n] are the tiles; v[0] and v[n + 1] are the posts
        v[0] = v[n + 1] = 1;
        for (int i = 0; i < n; i++) v[i + 1] = tiles[i];
        long[][] b = new long[n + 2][n + 2]; // b[a][c]: best for tiles a..c, 0 if a > c
        int[][] last = new int[n + 2][n + 2]; // the tile taken last in a..c
        for (int len = 1; len <= n; len++) // shorter stretches first
            for (int a = 1; a + len - 1 <= n; a++) {
                int c = a + len - 1;
                for (int k = a; k <= c; k++) { // k goes last, between a - 1 and c + 1
                    long score = b[a][k - 1] + b[k + 1][c] + v[a - 1] * v[k] * v[c + 1];
                    if (k == a || score > b[a][c]) {
                        b[a][c] = score;
                        last[a][c] = k;
                    }
                }
            }
        List<Integer> order = new ArrayList<>();
        take(last, 1, n, order);
        return new Removal(b[1][n], order);
    }

    // Both sides of the last tile first, then the tile.
    private static void take(int[][] last, int a, int c, List<Integer> order) {
        if (a > c) return;
        int k = last[a][c];
        take(last, a, k - 1, order);
        take(last, k + 1, c, order);
        order.add(k);
    }

    /** Least total cost to merge neighbouring piles into one; a merge costs the two sizes added. */
    public static Merging cheapestMerge(int[] piles) {
        int n = piles.length;
        long[] pre = new long[n + 1]; // pre[c + 1] - pre[a] is the size of piles a..c
        for (int i = 0; i < n; i++) pre[i + 1] = pre[i] + piles[i];
        long[][] m = new long[n][n]; // m[a][c]: least cost for piles a..c; 0 for one pile
        int[][] split = new int[n][n]; // the last merge joins a..split with the rest
        for (int len = 2; len <= n; len++)
            for (int a = 0; a + len - 1 < n; a++) {
                int c = a + len - 1;
                for (int k = a; k < c; k++) {
                    long cost = m[a][k] + m[k + 1][c] + pre[c + 1] - pre[a];
                    if (k == a || cost < m[a][c]) {
                        m[a][c] = cost;
                        split[a][c] = k;
                    }
                }
            }
        return new Merging(m[0][n - 1], brackets(piles, split, 0, n - 1));
    }

    private static String brackets(int[] piles, int[][] split, int a, int c) {
        if (a == c) return String.valueOf(piles[a]);
        int k = split[a][c];
        return "(" + brackets(piles, split, a, k) + " " + brackets(piles, split, k + 1, c) + ")";
    }
}
