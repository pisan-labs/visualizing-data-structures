import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Cheapest assignment of n rows to n columns: the Hungarian algorithm with potentials. */
public final class Hungarian {
  private Hungarian() {}

  /** Returns mate, where mate[i] is the column given to row i. */
  public static int[] solve(int[][] cost) {
    int n = cost.length;
    int[] u = new int[n], v = new int[n];
    for (int i = 0; i < n; i++) u[i] = Arrays.stream(cost[i]).min().getAsInt();
    for (int j = 0; j < n; j++) {
      v[j] = Integer.MAX_VALUE;
      for (int i = 0; i < n; i++) v[j] = Math.min(v[j], cost[i][j] - u[i]);
    }
    int[] rowMate = new int[n], colMate = new int[n];
    Arrays.fill(rowMate, -1);
    Arrays.fill(colMate, -1);

    for (int root = 0; root < n; root++) {
      List<Integer> treeRows = new ArrayList<>(List.of(root)); // S
      boolean[] inTree = new boolean[n]; // T
      int[] prev = new int[n]; // the row that reached column j
      int free = -1;
      while (free == -1) {
        for (int q = 0; q < treeRows.size() && free == -1; q++) {
          int i = treeRows.get(q);
          for (int j = 0; j < n && free == -1; j++) {
            if (inTree[j] || cost[i][j] - u[i] - v[j] != 0) continue;
            inTree[j] = true;
            prev[j] = i;
            if (colMate[j] == -1) free = j;
            else treeRows.add(colMate[j]);
          }
        }
        if (free != -1) break;
        int delta = Integer.MAX_VALUE; // stuck: make a new tight cell
        for (int i : treeRows)
          for (int j = 0; j < n; j++)
            if (!inTree[j]) delta = Math.min(delta, cost[i][j] - u[i] - v[j]);
        for (int i : treeRows) u[i] += delta;
        for (int j = 0; j < n; j++) if (inTree[j]) v[j] -= delta;
      }
      for (int j = free; j != -1; ) { // flip the augmenting path
        int i = prev[j], next = rowMate[i];
        rowMate[i] = j;
        colMate[j] = i;
        j = next;
      }
    }
    return rowMate;
  }

  /** To maximize, minimize M - cost, where M is the largest entry. */
  public static int[] solve(int[][] cost, boolean maximize) {
    if (!maximize) return solve(cost);
    int big = Arrays.stream(cost).flatMapToInt(Arrays::stream).max().getAsInt();
    int[][] flipped = new int[cost.length][];
    for (int i = 0; i < cost.length; i++)
      flipped[i] = Arrays.stream(cost[i]).map(c -> big - c).toArray();
    return solve(flipped);
  }
}
