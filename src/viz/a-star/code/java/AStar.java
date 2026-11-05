import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.PriorityQueue;

/** A* from S to T in a grid of strings ('.' open, '#' wall); every move costs 1. */
public class AStar {
  // Clockwise from north. The even entries are the four straight moves.
  static final int[][] MOVES = {
    {-1, 0}, {-1, 1}, {0, 1}, {1, 1}, {1, 0}, {1, -1}, {0, -1}, {-1, -1}
  };

  /** An open-set entry: least f first, then least h, then the one added first. */
  record Entry(double f, double h, int order, int cell) {}

  /** The cells r * cols + c from S to T, or an empty list if there is none. */
  public final List<Integer> path = new ArrayList<>();
  /** Cells taken from the open set and expanded. */
  public int expanded = 0;

  private final int cols, tr, tc;
  private final String heuristic;

  public AStar(String[] grid, String heuristic, double w, boolean eight) {
    int rows = grid.length;
    cols = grid[0].length();
    this.heuristic = heuristic;
    int s = find(grid, 'S'), t = find(grid, 'T');
    tr = t / cols;
    tc = t % cols;
    int[] g = new int[rows * cols];
    int[] parent = new int[rows * cols];
    boolean[] closed = new boolean[rows * cols];
    Arrays.fill(g, -1);
    Arrays.fill(parent, -1);
    PriorityQueue<Entry> open =
        new PriorityQueue<>(
            (a, b) ->
                a.f() != b.f()
                    ? Double.compare(a.f(), b.f())
                    : a.h() != b.h() ? Double.compare(a.h(), b.h()) : a.order() - b.order());
    int count = 0;
    g[s] = 0;
    open.add(new Entry(w * h(s), h(s), count, s));
    while (!open.isEmpty()) {
      int u = open.poll().cell();
      if (closed[u]) continue; // an older, worse entry for a cell already expanded
      closed[u] = true;
      expanded++;
      if (u == t) {
        for (int x = t; x != -1; x = parent[x]) path.add(x);
        Collections.reverse(path);
        return;
      }
      for (int m = 0; m < 8; m += eight ? 1 : 2) {
        int r = u / cols + MOVES[m][0], c = u % cols + MOVES[m][1];
        if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r].charAt(c) == '#') continue;
        int v = r * cols + c;
        if (closed[v]) continue;
        int cost = g[u] + 1;
        if (g[v] == -1 || cost < g[v]) {
          g[v] = cost;
          parent[v] = u;
          open.add(new Entry(cost + w * h(v), h(v), ++count, v));
        }
      }
    }
  }

  /** The guess at the cost from cell k to T. */
  double h(int k) {
    int dr = Math.abs(k / cols - tr), dc = Math.abs(k % cols - tc);
    return switch (heuristic) {
      case "manhattan" -> dr + dc;
      case "euclidean" -> Math.sqrt(dr * dr + dc * dc);
      case "chebyshev" -> Math.max(dr, dc);
      default -> 0;
    };
  }

  static int find(String[] grid, char ch) {
    for (int r = 0; r < grid.length; r++) {
      int c = grid[r].indexOf(ch);
      if (c >= 0) return r * grid[0].length() + c;
    }
    return -1;
  }
}
