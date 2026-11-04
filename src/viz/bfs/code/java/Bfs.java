import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Queue;

/** Breadth-first search from s, as in CLRS. adj.get(u) lists u's neighbours in order. */
class Bfs {
  static final int WHITE = 0, GRAY = 1, BLACK = 2;
  static final int INF = -1, NIL = -1;

  final List<Integer> order = new ArrayList<>();
  final int[] d; // INF when unreachable
  final int[] pi; // NIL when there is no parent

  Bfs(List<List<Integer>> adj, int s) {
    int n = adj.size();
    int[] color = new int[n]; // all WHITE
    d = new int[n];
    pi = new int[n];
    Arrays.fill(d, INF);
    Arrays.fill(pi, NIL);
    color[s] = GRAY;
    d[s] = 0;
    Queue<Integer> q = new ArrayDeque<>();
    q.add(s);
    while (!q.isEmpty()) {
      int u = q.remove();
      order.add(u);
      for (int v : adj.get(u)) {
        if (color[v] == WHITE) {
          color[v] = GRAY;
          d[v] = d[u] + 1;
          pi[v] = u;
          q.add(v);
        }
      }
      color[u] = BLACK;
    }
  }
}
