import java.util.ArrayList;
import java.util.List;
import java.util.function.IntBinaryOperator;

/**
 * One trial of Karger's algorithm on vertices 0..n-1: contract a random edge until two
 * super-vertices are left. randInt.applyAsInt(lo, hi) returns a random int in [lo, hi].
 */
public class Karger {
  /** Each vertex's super-vertex: its smallest member. */
  public final int[] group;
  /** The edges between the two super-vertices that are left. */
  public final List<int[]> cut = new ArrayList<>();

  public Karger(int n, List<int[]> edges, IntBinaryOperator randInt) {
    group = new int[n];
    for (int v = 0; v < n; v++) group[v] = v;
    int count = n;
    while (count > 2) {
      List<int[]> left = new ArrayList<>(); // self-loops are gone
      for (int[] e : edges) if (group[e[0]] != group[e[1]]) left.add(e);
      if (left.isEmpty()) break; // not connected: the cut is empty
      int[] e = left.get(randInt.applyAsInt(0, left.size() - 1));
      int keep = Math.min(group[e[0]], group[e[1]]);
      int gone = Math.max(group[e[0]], group[e[1]]);
      for (int v = 0; v < n; v++) if (group[v] == gone) group[v] = keep;
      count--;
    }
    for (int[] e : edges) if (group[e[0]] != group[e[1]]) cut.add(e);
  }
}
