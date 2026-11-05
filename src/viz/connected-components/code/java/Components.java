import java.util.ArrayDeque;
import java.util.List;
import java.util.Queue;

/**
 * Connected components of an undirected graph, numbered from 1. adj.get(u) lists u's
 * neighbours in order. Each vertex without a number starts a breadth-first search.
 */
class Components {
  static final int NIL = 0;

  int count = 0;
  final int[] cc; // the component of each vertex

  Components(List<List<Integer>> adj) {
    int n = adj.size();
    cc = new int[n]; // all NIL
    for (int s = 0; s < n; s++) {
      if (cc[s] != NIL) continue;
      count++;
      cc[s] = count;
      Queue<Integer> q = new ArrayDeque<>();
      q.add(s);
      while (!q.isEmpty()) {
        int u = q.remove();
        for (int v : adj.get(u)) {
          if (cc[v] == NIL) {
            cc[v] = count;
            q.add(v);
          }
        }
      }
    }
  }
}
