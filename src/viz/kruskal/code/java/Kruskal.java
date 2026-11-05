import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Kruskal's minimum spanning tree (a forest if the graph is not connected). */
class Kruskal {
  long total; // the weight of the tree
  final List<int[]> tree = new ArrayList<>(); // tree edges {u, v}, in the order added

  private final int[] parent;
  private final int[] rank;

  /** edges lists {u, v, w} for vertices 0..n-1. */
  Kruskal(int n, List<int[]> edges) {
    parent = new int[n];
    rank = new int[n];
    for (int i = 0; i < n; i++) parent[i] = i;
    List<int[]> sorted = new ArrayList<>(edges);
    sorted.sort(
        Comparator.<int[]>comparingInt(e -> e[2]).thenComparingInt(e -> e[0]).thenComparingInt(e -> e[1]));
    for (int[] e : sorted) {
      int a = find(e[0]), b = find(e[1]);
      if (a == b) continue; // u-v would close a cycle
      tree.add(new int[] {e[0], e[1]});
      total += e[2];
      if (rank[a] > rank[b]) { // union by rank
        parent[b] = a;
      } else {
        parent[a] = b;
        if (rank[a] == rank[b]) rank[b]++;
      }
    }
  }

  private int find(int x) {
    if (parent[x] != x) parent[x] = find(parent[x]); // path compression
    return parent[x];
  }
}
