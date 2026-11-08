import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.PriorityQueue;

/** Johnson's all-pairs shortest paths. */
public class Johnson {
  public static final long INF = Long.MAX_VALUE;

  /** arcs.get(i) = {u, v, w}; returns dist[s][t] (INF for no path), or null on a negative cycle. */
  public static long[][] allPairs(int n, List<int[]> arcs) {
    // Bellman-Ford from a new vertex q with a 0 arc to every vertex: h starts at 0.
    long[] h = new long[n];
    for (int pass = 0; pass < n; pass++) {
      boolean changed = false;
      for (int[] a : arcs) {
        if (h[a[0]] + a[2] < h[a[1]]) {
          h[a[1]] = h[a[0]] + a[2];
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (int[] a : arcs) if (h[a[0]] + a[2] < h[a[1]]) return null; // negative cycle

    List<List<long[]>> out = new ArrayList<>(); // reweighted: w' = w + h(u) - h(v) >= 0
    for (int i = 0; i < n; i++) out.add(new ArrayList<>());
    for (int[] a : arcs) out.get(a[0]).add(new long[] {a[1], a[2] + h[a[0]] - h[a[1]]});
    long[][] dist = new long[n][];
    for (int s = 0; s < n; s++) {
      long[] d = new long[n];
      Arrays.fill(d, INF);
      d[s] = 0;
      PriorityQueue<long[]> pq = new PriorityQueue<>((x, y) -> Long.compare(x[0], y[0]));
      pq.add(new long[] {0, s});
      while (!pq.isEmpty()) {
        long[] top = pq.poll();
        int u = (int) top[1];
        if (top[0] > d[u]) continue; // stale entry
        for (long[] e : out.get(u)) {
          int v = (int) e[0];
          if (d[u] + e[1] < d[v]) {
            d[v] = d[u] + e[1];
            pq.add(new long[] {d[v], v});
          }
        }
      }
      dist[s] = new long[n];
      for (int t = 0; t < n; t++) dist[s][t] = d[t] == INF ? INF : d[t] - h[s] + h[t];
    }
    return dist;
  }
}
