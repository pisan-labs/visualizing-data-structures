import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Bellman-Ford shortest paths from s, as in CLRS. Each edge is {u, v, w}, in relax order. */
class BellmanFord {
  static final long INF = Long.MAX_VALUE;
  static final int NIL = -1;

  final long[] d; // INF when unreachable
  final int[] pi; // NIL when there is no parent
  List<Integer> cycle; // a negative cycle s can reach, in order, or null

  BellmanFord(int n, List<int[]> edges, int s) {
    d = new long[n];
    pi = new int[n];
    Arrays.fill(d, INF);
    Arrays.fill(pi, NIL);
    d[s] = 0;
    for (int i = 1; i < n; i++)
      for (int[] e : edges)
        if (d[e[0]] != INF && d[e[0]] + e[2] < d[e[1]]) {
          d[e[1]] = d[e[0]] + e[2];
          pi[e[1]] = e[0];
        }
    for (int[] e : edges) {
      if (d[e[0]] != INF && d[e[0]] + e[2] < d[e[1]]) {
        d[e[1]] = d[e[0]] + e[2];
        pi[e[1]] = e[0];
        // Follow pi back from v until a vertex repeats: from there on it is the cycle.
        List<Integer> walk = new ArrayList<>();
        int x = e[1];
        while (!walk.contains(x)) {
          walk.add(x);
          x = pi[x];
        }
        cycle = new ArrayList<>(walk.subList(walk.indexOf(x), walk.size()));
        Collections.reverse(cycle);
        return;
      }
    }
  }
}
