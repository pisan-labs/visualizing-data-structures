import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * FIFO push-relabel: flood the arcs out of s, then push excess one level downhill.
 * cap[u][v] is the capacity of the arc u -> v (0 for none). flow[u][v] is the net flow, so
 * flow[v][u] == -flow[u][v] and the residual capacity is cap[u][v] - flow[u][v].
 */
public class PushRelabel {
  public final int[][] flow;
  public final int value;
  public int pushes = 0;
  public int relabels = 0;
  /** The s side of a minimum cut: what s still reaches in the residual network. */
  public final List<Integer> side = new ArrayList<>();

  public PushRelabel(int[][] cap, int s, int t) {
    int n = cap.length;
    flow = new int[n][n];
    int[] height = new int[n], excess = new int[n], current = new int[n];
    List<List<Integer>> nbrs = new ArrayList<>();
    for (int u = 0; u < n; u++) {
      List<Integer> list = new ArrayList<>();
      for (int v = 0; v < n; v++) if (cap[u][v] > 0 || cap[v][u] > 0) list.add(v);
      nbrs.add(list);
    }
    height[s] = n;
    ArrayDeque<Integer> queue = new ArrayDeque<>();
    for (int v = 0; v < n; v++) { // the preflow: fill every arc out of s
      if (cap[s][v] > 0) {
        flow[s][v] = cap[s][v];
        flow[v][s] = -cap[s][v];
        excess[v] += cap[s][v];
        excess[s] -= cap[s][v];
        if (v != t) queue.add(v);
      }
    }
    while (!queue.isEmpty()) {
      int u = queue.poll();
      while (excess[u] > 0) { // discharge u
        List<Integer> list = nbrs.get(u);
        if (current[u] == list.size()) { // relabel: one above the lowest residual neighbour
          int low = Integer.MAX_VALUE;
          for (int v : list) if (cap[u][v] - flow[u][v] > 0) low = Math.min(low, height[v]);
          height[u] = low + 1;
          current[u] = 0;
          relabels++;
          continue;
        }
        int v = list.get(current[u]);
        int room = cap[u][v] - flow[u][v];
        if (room > 0 && height[u] == height[v] + 1) { // admissible: push
          int d = Math.min(excess[u], room);
          flow[u][v] += d;
          flow[v][u] -= d;
          excess[u] -= d;
          excess[v] += d;
          pushes++;
          if (v != s && v != t && excess[v] == d) queue.add(v); // v just started to overflow
        } else {
          current[u]++;
        }
      }
    }
    value = excess[t];
    boolean[] seen = new boolean[n];
    ArrayDeque<Integer> todo = new ArrayDeque<>();
    seen[s] = true;
    todo.add(s);
    while (!todo.isEmpty()) {
      int u = todo.poll();
      for (int v = 0; v < n; v++) {
        if (!seen[v] && cap[u][v] - flow[u][v] > 0) {
          seen[v] = true;
          todo.add(v);
        }
      }
    }
    for (int v = 0; v < n; v++) if (seen[v]) side.add(v);
  }
}
