import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Tours of cities 0..n-1 that start at 0. d[i][j] is the distance from i to j. */
class Tsp {
  static final long INF = Long.MAX_VALUE / 4;

  /** Held-Karp: the length of the shortest tour. O(2^n n^2) time. */
  static long heldKarp(int[][] d) {
    int n = d.length;
    if (n == 1) return 0;
    int m = n - 1; // bit j of a set S stands for city j + 1
    // c[S][j]: the shortest path from 0 through every city of S, ending at j.
    long[][] c = new long[1 << m][m];
    for (long[] row : c) Arrays.fill(row, INF);
    for (int j = 0; j < m; j++) c[1 << j][j] = d[0][j + 1];
    for (int s = 1; s < (1 << m); s++) {
      for (int j = 0; j < m; j++) {
        if ((s >> j & 1) == 0 || s == 1 << j) continue;
        int prev = s ^ (1 << j);
        for (int k = 0; k < m; k++) {
          if ((prev >> k & 1) == 1) c[s][j] = Math.min(c[s][j], c[prev][k] + d[k + 1][j + 1]);
        }
      }
    }
    long best = INF;
    for (int j = 0; j < m; j++) best = Math.min(best, c[(1 << m) - 1][j] + d[j + 1][0]);
    return best;
  }

  /**
   * CLRS's APPROX-TSP-TOUR: a minimum spanning tree from city 0 (Prim with an array), then the
   * cities in preorder. With the triangle inequality, at most twice the optimum.
   */
  static List<Integer> approxTour(int[][] d) {
    int n = d.length;
    long[] key = new long[n];
    int[] parent = new int[n];
    boolean[] inTree = new boolean[n];
    Arrays.fill(key, INF);
    Arrays.fill(parent, -1);
    key[0] = 0;
    for (int round = 0; round < n; round++) {
      int u = -1;
      for (int v = 0; v < n; v++) if (!inTree[v] && (u < 0 || key[v] < key[u])) u = v;
      inTree[u] = true;
      for (int v = 0; v < n; v++) {
        if (!inTree[v] && d[u][v] < key[v]) {
          key[v] = d[u][v];
          parent[v] = u;
        }
      }
    }
    List<List<Integer>> children = new ArrayList<>();
    for (int v = 0; v < n; v++) children.add(new ArrayList<>());
    for (int v = 1; v < n; v++) children.get(parent[v]).add(v);
    List<Integer> tour = new ArrayList<>();
    preorder(0, children, tour);
    return tour;
  }

  private static void preorder(int u, List<List<Integer>> children, List<Integer> tour) {
    tour.add(u);
    for (int c : children.get(u)) preorder(c, children, tour);
  }

  static long length(int[][] d, List<Integer> tour) {
    int n = tour.size();
    long total = 0;
    if (n > 1) for (int i = 0; i < n; i++) total += d[tour.get(i)][tour.get((i + 1) % n)];
    return total;
  }
}
