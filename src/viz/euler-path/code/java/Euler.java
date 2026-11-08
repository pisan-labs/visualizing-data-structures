import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedList;
import java.util.List;

/** An Euler path or circuit by Hierholzer's algorithm. */
public class Euler {
  /** The path as vertex numbers, or null when there is none. edges.get(i) = {u, v}. */
  public static List<Integer> eulerPath(int n, List<int[]> edges, boolean directed) {
    List<List<int[]>> out = new ArrayList<>(); // {far end, edge index}
    int[] balance = new int[n]; // out - in, or the degree when undirected
    for (int i = 0; i < n; i++) out.add(new ArrayList<>());
    for (int i = 0; i < edges.size(); i++) {
      int u = edges.get(i)[0], v = edges.get(i)[1];
      out.get(u).add(new int[] {v, i});
      balance[u]++;
      if (directed) balance[v]--;
      else {
        out.get(v).add(new int[] {u, i});
        balance[v]++;
      }
    }
    for (List<int[]> l : out) l.sort((a, b) -> a[0] != b[0] ? a[0] - b[0] : a[1] - b[1]);
    if (edges.isEmpty() || !onePiece(n, edges)) return null;
    int start = -1;
    List<Integer> bad = new ArrayList<>();
    for (int v = 0; v < n; v++)
      if (directed ? balance[v] != 0 : balance[v] % 2 == 1) bad.add(v);
    if (directed) {
      if (!bad.isEmpty()) {
        if (bad.size() != 2 || balance[bad.get(0)] + balance[bad.get(1)] != 0
            || Math.abs(balance[bad.get(0)]) != 1) return null;
        start = balance[bad.get(0)] == 1 ? bad.get(0) : bad.get(1);
      }
    } else {
      if (bad.size() != 0 && bad.size() != 2) return null;
      if (!bad.isEmpty()) start = bad.get(0);
    }
    for (int v = 0; start < 0; v++) if (!out.get(v).isEmpty()) start = v;

    boolean[] used = new boolean[edges.size()];
    int[] next = new int[n];
    Deque<Integer> stack = new ArrayDeque<>(List.of(start));
    LinkedList<Integer> circuit = new LinkedList<>();
    while (!stack.isEmpty()) {
      int v = stack.peek();
      List<int[]> l = out.get(v);
      while (next[v] < l.size() && used[l.get(next[v])[1]]) next[v]++;
      if (next[v] < l.size()) { // walk an unused edge
        used[l.get(next[v])[1]] = true;
        stack.push(l.get(next[v])[0]);
      } else { // stuck: v goes at the front of the circuit
        circuit.addFirst(stack.pop());
      }
    }
    return circuit;
  }

  /** Are all vertices with an edge connected (ignoring directions)? */
  static boolean onePiece(int n, List<int[]> edges) {
    List<List<Integer>> adj = new ArrayList<>();
    for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
    for (int[] e : edges) {
      adj.get(e[0]).add(e[1]);
      adj.get(e[1]).add(e[0]);
    }
    boolean[] seen = new boolean[n];
    Deque<Integer> stack = new ArrayDeque<>(List.of(edges.get(0)[0]));
    seen[edges.get(0)[0]] = true;
    while (!stack.isEmpty())
      for (int w : adj.get(stack.pop()))
        if (!seen[w]) {
          seen[w] = true;
          stack.push(w);
        }
    for (int v = 0; v < n; v++) if (!adj.get(v).isEmpty() && !seen[v]) return false;
    return true;
  }
}
