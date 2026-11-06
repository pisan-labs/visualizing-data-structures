import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Shortest path from S to T in a grid of strings ('.' open, '#' wall). */
public class GridBfs {
  // Clockwise from north. The even entries are the four straight moves.
  static final int[][] MOVES = {
    {-1, 0}, {-1, 1}, {0, 1}, {1, 1}, {1, 0}, {1, -1}, {0, -1}, {-1, -1}
  };

  /** The cells r * cols + c from S to T, or an empty list if there is none. */
  public final List<Integer> path = new ArrayList<>();
  /** Cells that left the queue. */
  public int expanded = 0;

  public GridBfs(String[] grid, boolean eight) {
    int rows = grid.length, cols = grid[0].length();
    int s = find(grid, 'S'), t = find(grid, 'T');
    int[] d = new int[rows * cols];
    int[] parent = new int[rows * cols];
    Arrays.fill(d, -1);
    Arrays.fill(parent, -1);
    d[s] = 0;
    ArrayDeque<Integer> q = new ArrayDeque<>();
    q.add(s);
    while (!q.isEmpty()) {
      int u = q.poll();
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
        if (d[v] == -1) {
          d[v] = d[u] + 1;
          parent[v] = u;
          q.add(v);
        }
      }
    }
  }

  static int find(String[] grid, char ch) {
    for (int r = 0; r < grid.length; r++) {
      int c = grid[r].indexOf(ch);
      if (c >= 0) return r * grid[0].length() + c;
    }
    return -1;
  }
}
