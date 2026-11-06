import java.util.Arrays;
import java.util.List;

/**
 * Kuhn's algorithm: an augmenting path search from each left vertex in turn.
 * adj.get(u) lists the right vertices joined to left vertex u, in order. matchR[v] is the left
 * partner of right vertex v, or -1 if v is free.
 */
public class Matching {
  private final List<List<Integer>> adj;
  public final int[] matchR;
  public int size = 0;

  public Matching(List<List<Integer>> adj, int nRight) {
    this.adj = adj;
    matchR = new int[nRight];
    Arrays.fill(matchR, -1);
    for (int u = 0; u < adj.size(); u++) {
      if (tryMatch(u, new boolean[nRight])) size++;
    }
  }

  private boolean tryMatch(int u, boolean[] visited) {
    for (int v : adj.get(u)) {
      if (visited[v]) continue;
      visited[v] = true;
      // v is free, or its partner can move to another right vertex.
      if (matchR[v] == -1 || tryMatch(matchR[v], visited)) {
        matchR[v] = u;
        return true;
      }
    }
    return false;
  }
}
