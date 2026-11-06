import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Edmonds-Karp: Ford-Fulkerson with breadth-first search for each augmenting path.
 * cap[u][v] is the capacity of the arc u -> v (0 for none). flow[u][v] is the net flow, so
 * flow[v][u] == -flow[u][v] and the residual capacity is cap[u][v] - flow[u][v].
 */
public class MaxFlow {
  public final int[][] flow;
  public int value = 0;
  public int paths = 0;
  /** The s side of a minimum cut: what s still reaches when no augmenting path is left. */
  public final List<Integer> side = new ArrayList<>();

  public MaxFlow(int[][] cap, int s, int t) {
    int n = cap.length;
    flow = new int[n][n];
    int[] parent = new int[n];
    while (true) {
      Arrays.fill(parent, -1);
      parent[s] = s;
      ArrayDeque<Integer> queue = new ArrayDeque<>();
      queue.add(s);
      while (!queue.isEmpty() && parent[t] == -1) {
        int u = queue.poll();
        for (int v = 0; v < n; v++) {
          if (parent[v] == -1 && cap[u][v] - flow[u][v] > 0) {
            parent[v] = u;
            queue.add(v);
            if (v == t) break;
          }
        }
      }
      if (parent[t] == -1) break;
      int b = Integer.MAX_VALUE;
      for (int v = t; v != s; v = parent[v]) b = Math.min(b, cap[parent[v]][v] - flow[parent[v]][v]);
      for (int v = t; v != s; v = parent[v]) {
        flow[parent[v]][v] += b;
        flow[v][parent[v]] -= b;
      }
      value += b;
      paths++;
    }
    for (int v = 0; v < n; v++) if (parent[v] != -1) side.add(v);
  }
}
