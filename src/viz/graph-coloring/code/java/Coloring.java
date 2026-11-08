import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Greedy coloring: each vertex, in order, gets the smallest color its neighbours lack. */
public class Coloring {
  /** adj.get(v) lists v's neighbours. Returns the color of each vertex, from 1. */
  public static int[] greedyColor(int n, List<List<Integer>> adj) {
    int[] color = new int[n];
    for (int v = 0; v < n; v++) {
      Set<Integer> used = new HashSet<>();
      for (int u : adj.get(v)) used.add(color[u]);
      int c = 1;
      while (used.contains(c)) c++;
      color[v] = c;
    }
    return color;
  }
}
