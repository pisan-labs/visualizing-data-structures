import java.util.ArrayList;
import java.util.List;

/** Vertex covers of an undirected graph on vertices 0..n-1; edges are {u, v} pairs. */
class VertexCover {
  /**
   * CLRS's APPROX-VERTEX-COVER: take an edge with neither end in the cover and add both ends.
   * The edges taken share no vertex, and any cover needs one end of each, so the cover is at
   * most twice the smallest.
   */
  static List<Integer> approx(int n, List<int[]> edges) {
    List<Integer> cover = new ArrayList<>();
    boolean[] taken = new boolean[n];
    for (int[] e : edges) {
      if (!taken[e[0]] && !taken[e[1]]) {
        cover.add(e[0]);
        cover.add(e[1]);
        taken[e[0]] = taken[e[1]] = true;
      }
    }
    return cover;
  }

  /** Brute force over all 2^n sets of vertices: the size of a smallest cover. */
  static int minSize(int n, List<int[]> edges) {
    int best = n;
    for (int mask = 0; mask < (1 << n); mask++) {
      int k = Integer.bitCount(mask);
      if (k >= best) continue;
      boolean ok = true;
      for (int[] e : edges) {
        if ((mask >> e[0] & 1) == 0 && (mask >> e[1] & 1) == 0) {
          ok = false;
          break;
        }
      }
      if (ok) best = k;
    }
    return best;
  }
}
