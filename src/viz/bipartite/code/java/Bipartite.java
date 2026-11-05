import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Queue;

/**
 * Two-colors an undirected graph with breadth-first search. adj.get(u) lists u's neighbours
 * in order. Afterwards either ok is true and side holds 0 or 1 for every vertex, or ok is
 * false and cycle is an odd cycle that proves no split exists.
 */
class Bipartite {
  static final int NIL = -1;

  boolean ok = true;
  final int[] side;
  final List<Integer> cycle = new ArrayList<>();

  Bipartite(List<List<Integer>> adj) {
    int n = adj.size();
    side = new int[n];
    int[] parent = new int[n];
    Arrays.fill(side, NIL);
    Arrays.fill(parent, NIL);
    for (int s = 0; s < n; s++) {
      if (side[s] != NIL) continue;
      side[s] = 0;
      Queue<Integer> q = new ArrayDeque<>();
      q.add(s);
      while (!q.isEmpty()) {
        int u = q.remove();
        for (int v : adj.get(u)) {
          if (side[v] == NIL) {
            side[v] = 1 - side[u];
            parent[v] = u;
            q.add(v);
          } else if (side[v] == side[u]) {
            ok = false;
            oddCycle(parent, u, v);
            return;
          }
        }
      }
    }
  }

  /** Up from u to where the tree paths meet, then down to v. */
  private void oddCycle(int[] parent, int u, int v) {
    List<Integer> up = new ArrayList<>(), vp = new ArrayList<>();
    for (int x = u; x != NIL; x = parent[x]) up.add(x);
    for (int x = v; x != NIL; x = parent[x]) vp.add(x);
    int j = 0;
    while (!up.contains(vp.get(j))) j++;
    int meet = vp.get(j);
    cycle.addAll(up.subList(0, up.indexOf(meet) + 1));
    List<Integer> down = new ArrayList<>(vp.subList(0, j));
    Collections.reverse(down);
    cycle.addAll(down);
  }
}
