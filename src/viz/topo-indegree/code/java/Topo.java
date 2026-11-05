import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;

/**
 * Kahn's algorithm: repeatedly take a vertex with no arcs left coming in. adj.get(u) lists
 * the heads of u's arcs in order. If the graph has a cycle, the vertices on it (and after
 * it) never become ready, and the order is shorter than the number of vertices.
 */
class Topo {
  static List<Integer> sort(List<List<Integer>> adj) {
    int n = adj.size();
    int[] indegree = new int[n];
    for (List<Integer> heads : adj) for (int v : heads) indegree[v]++;
    Queue<Integer> q = new ArrayDeque<>();
    for (int v = 0; v < n; v++) if (indegree[v] == 0) q.add(v);
    List<Integer> order = new ArrayList<>();
    while (!q.isEmpty()) {
      int u = q.remove();
      order.add(u);
      for (int v : adj.get(u)) {
        indegree[v]--;
        if (indegree[v] == 0) q.add(v);
      }
    }
    return order;
  }
}
