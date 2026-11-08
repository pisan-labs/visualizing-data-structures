import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.List;
import java.util.TreeMap;

/** Boruvka's minimum spanning tree (a forest if the graph is not connected). */
public class Boruvka {
  public final List<Integer> tree = new ArrayList<>(); // edge indexes, in the order they joined
  public int total;

  /** edges.get(i) = {u, v, w} for vertices 0..n-1. Ties go to the edge earlier in the list. */
  public Boruvka(int n, List<int[]> edges) {
    while (true) {
      int[] comp = components(n, edges);
      TreeMap<Integer, Integer> cheapest = new TreeMap<>(); // component -> its cheapest edge out
      for (int i = 0; i < edges.size(); i++) {
        int[] e = edges.get(i);
        if (comp[e[0]] == comp[e[1]]) continue;
        for (int c : new int[] {comp[e[0]], comp[e[1]]}) {
          Integer best = cheapest.get(c);
          if (best == null || e[2] < edges.get(best)[2]) cheapest.put(c, i);
        }
      }
      if (cheapest.isEmpty()) break;
      for (int i : cheapest.values()) {
        if (!tree.contains(i)) { // both ends may pick the same edge
          tree.add(i);
          total += edges.get(i)[2];
        }
      }
    }
  }

  /** Label each vertex with the smallest vertex of its piece of the tree so far. */
  private int[] components(int n, List<int[]> edges) {
    List<List<Integer>> adj = new ArrayList<>();
    for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
    for (int i : tree) {
      int[] e = edges.get(i);
      adj.get(e[0]).add(e[1]);
      adj.get(e[1]).add(e[0]);
    }
    int[] comp = new int[n];
    Arrays.fill(comp, -1);
    for (int s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      comp[s] = s;
      Deque<Integer> stack = new ArrayDeque<>(List.of(s));
      while (!stack.isEmpty()) {
        for (int w : adj.get(stack.pop())) {
          if (comp[w] < 0) {
            comp[w] = s;
            stack.push(w);
          }
        }
      }
    }
    return comp;
  }
}
