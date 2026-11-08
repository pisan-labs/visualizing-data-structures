import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Lowest common ancestors on a rooted tree in O(log n) per query. */
public class BinaryLifting {
  final int log;
  final int[] depth;
  final int[][] up; // up[k][v]: the ancestor 2^k steps above v, or -1 past the root

  public BinaryLifting(List<List<Integer>> adj, int root) {
    int n = adj.size();
    log = Math.max(1, 32 - Integer.numberOfLeadingZeros(n - 1)); // ceil(log2 n)
    depth = new int[n];
    Arrays.fill(depth, -1);
    up = new int[log][n];
    Arrays.fill(up[0], -1);
    depth[root] = 0;
    List<Integer> order = new ArrayList<>(List.of(root));
    for (int i = 0; i < order.size(); i++) { // BFS: depths and parents
      int u = order.get(i);
      for (int w : adj.get(u)) {
        if (depth[w] < 0) {
          depth[w] = depth[u] + 1;
          up[0][w] = u;
          order.add(w);
        }
      }
    }
    for (int k = 1; k < log; k++)
      for (int v = 0; v < n; v++) up[k][v] = up[k - 1][v] < 0 ? -1 : up[k - 1][up[k - 1][v]];
  }

  public int lca(int u, int v) {
    if (depth[u] < depth[v]) {
      int t = u;
      u = v;
      v = t;
    }
    for (int diff = depth[u] - depth[v], k = 0; diff > 0; diff >>= 1, k++)
      if ((diff & 1) == 1) u = up[k][u]; // lift u, one jump per 1-bit
    if (u == v) return u;
    for (int k = log - 1; k >= 0; k--) {
      if (up[k][u] != up[k][v]) {
        u = up[k][u];
        v = up[k][v];
      }
    }
    return up[0][u];
  }
}
