import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.List;

/** Maximum matching in a general graph: Edmonds' blossom algorithm. */
public final class Blossom {
  private final List<List<Integer>> adj; // neighbours in increasing order
  private final int n;
  private final int[] mate, p, base, root;
  private final boolean[] even, odd;

  private Blossom(List<List<Integer>> adj) {
    this.adj = adj;
    n = adj.size();
    mate = new int[n];
    p = new int[n];
    base = new int[n];
    root = new int[n];
    even = new boolean[n];
    odd = new boolean[n];
    Arrays.fill(mate, -1);
  }

  /** Returns mate, where mate[v] is v's partner or -1. */
  public static int[] maxMatching(List<List<Integer>> adj) {
    Blossom b = new Blossom(adj);
    while (b.phase()) {}
    return b.mate;
  }

  /** Grow an alternating forest from every free vertex; true if it augmented. */
  private boolean phase() {
    Arrays.fill(even, false);
    Arrays.fill(odd, false);
    Arrays.fill(p, -1);
    ArrayDeque<Integer> queue = new ArrayDeque<>();
    for (int v = 0; v < n; v++) {
      base[v] = v;
      root[v] = v;
      if (mate[v] == -1) {
        even[v] = true;
        queue.add(v);
      }
    }
    while (!queue.isEmpty()) {
      int v = queue.poll();
      for (int w : adj.get(v)) {
        if (base[v] == base[w] || mate[v] == w || odd[w]) continue;
        if (!even[w]) { // w is matched and in no tree
          odd[w] = true;
          p[w] = v;
          int m = mate[w];
          even[m] = true;
          root[w] = root[m] = root[v];
          queue.add(m);
        } else if (root[w] != root[v]) { // augmenting path
          flip(v);
          flip(w);
          mate[v] = w;
          mate[w] = v;
          return true;
        } else { // a blossom: contract it into its base
          int b = lca(v, w);
          boolean[] inBlossom = new boolean[n];
          markPath(v, b, w, inBlossom);
          markPath(w, b, v, inBlossom);
          for (int x = 0; x < n; x++) {
            if (!inBlossom[base[x]]) continue;
            base[x] = b;
            if (!even[x]) {
              even[x] = true;
              odd[x] = false;
              queue.add(x);
            }
          }
        }
      }
    }
    return false;
  }

  private int lca(int a, int b) {
    boolean[] seen = new boolean[n];
    while (true) {
      a = base[a];
      seen[a] = true;
      if (mate[a] == -1) break;
      a = p[mate[a]];
    }
    while (!seen[base[b]]) b = p[mate[base[b]]];
    return base[b];
  }

  private void markPath(int v, int b, int child, boolean[] inBlossom) {
    while (base[v] != b) {
      inBlossom[base[v]] = inBlossom[base[mate[v]]] = true;
      p[v] = child;
      child = mate[v];
      v = p[mate[v]];
    }
  }

  /** Flip the alternating path from even vertex e to its root. */
  private void flip(int e) {
    for (int m = mate[e]; m != -1; ) {
      int pm = p[m], next = mate[pm];
      mate[m] = pm;
      mate[pm] = m;
      m = next;
    }
  }
}
