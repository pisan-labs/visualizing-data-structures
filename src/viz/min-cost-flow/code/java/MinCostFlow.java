import java.util.Arrays;

/**
 * Successive shortest paths, with Bellman-Ford for each cheapest path.
 * cap[u][v] and cost[u][v] describe the arc u -> v (0 capacity for none; no pair of vertices has
 * arcs both ways). flow[u][v] is the net flow, so flow[v][u] == -flow[u][v]. A residual arc
 * u -> v costs cost[u][v] when it is a real arc and -cost[v][u] when it sends flow back.
 * want == 0 sends as much as possible.
 */
public class MinCostFlow {
  static final long INF = Long.MAX_VALUE / 4;
  public final int[][] flow;
  public int value = 0;
  public long total = 0;
  public int paths = 0;

  public MinCostFlow(int[][] cap, int[][] cost, int s, int t, int want) {
    int n = cap.length;
    flow = new int[n][n];
    int[][] w = new int[n][n];
    for (int u = 0; u < n; u++)
      for (int v = 0; v < n; v++) w[u][v] = cap[u][v] > 0 ? cost[u][v] : -cost[v][u];
    long[] d = new long[n];
    int[] parent = new int[n];
    while (want == 0 || value < want) {
      Arrays.fill(d, INF);
      Arrays.fill(parent, -1);
      d[s] = 0;
      for (int pass = 1; pass < n; pass++) {
        boolean changed = false;
        for (int u = 0; u < n; u++) {
          if (d[u] == INF) continue;
          for (int v = 0; v < n; v++) {
            if (cap[u][v] - flow[u][v] > 0 && d[u] + w[u][v] < d[v]) {
              d[v] = d[u] + w[u][v];
              parent[v] = u;
              changed = true;
            }
          }
        }
        if (!changed) break;
      }
      if (d[t] == INF) break;
      int b = want > 0 ? want - value : Integer.MAX_VALUE;
      for (int v = t; v != s; v = parent[v]) b = Math.min(b, cap[parent[v]][v] - flow[parent[v]][v]);
      for (int v = t; v != s; v = parent[v]) {
        flow[parent[v]][v] += b;
        flow[v][parent[v]] -= b;
      }
      value += b;
      total += b * d[t];
      paths++;
    }
  }
}
