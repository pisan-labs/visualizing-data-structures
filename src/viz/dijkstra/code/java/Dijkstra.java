import java.util.Arrays;
import java.util.List;
import java.util.PriorityQueue;

/** Dijkstra's shortest paths from s. adj.get(u) lists edges {v, w}, each with w >= 0. */
class Dijkstra {
  static final long INF = Long.MAX_VALUE;
  static final int NIL = -1;

  final long[] d; // INF when unreachable
  final int[] pi; // NIL when there is no parent

  Dijkstra(List<List<int[]>> adj, int s) {
    for (List<int[]> edges : adj)
      for (int[] e : edges)
        if (e[1] < 0) throw new IllegalArgumentException("Dijkstra needs weights of at least 0");
    int n = adj.size();
    d = new long[n];
    pi = new int[n];
    Arrays.fill(d, INF);
    Arrays.fill(pi, NIL);
    boolean[] done = new boolean[n];
    d[s] = 0;
    // Entries {key, vertex}, smallest key first.
    PriorityQueue<long[]> q =
        new PriorityQueue<>((a, b) -> a[0] != b[0] ? Long.compare(a[0], b[0]) : Long.compare(a[1], b[1]));
    q.add(new long[] {0, s});
    while (!q.isEmpty()) {
      int u = (int) q.remove()[1];
      if (done[u]) continue; // a stale entry: u was settled with a smaller key
      done[u] = true;
      for (int[] e : adj.get(u)) {
        int v = e[0];
        if (d[u] + e[1] < d[v]) {
          d[v] = d[u] + e[1];
          pi[v] = u;
          q.add(new long[] {d[v], v});
        }
      }
    }
  }
}
