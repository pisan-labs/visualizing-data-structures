import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Bowyer–Watson: add points one at a time, re-triangulating the hole each one makes. */
public class Delaunay {
  static final long FAR = 10000; // the super triangle's corners, far enough to act like infinity

  /** Positive if d is inside the circle through a, b, c (counter-clockwise). Exact in long. */
  static long inCircle(long[] a, long[] b, long[] c, long[] d) {
    long adx = a[0] - d[0], ady = a[1] - d[1];
    long bdx = b[0] - d[0], bdy = b[1] - d[1];
    long cdx = c[0] - d[0], cdy = c[1] - d[1];
    return (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy)
        - (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady)
        + (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady);
  }

  /** Delaunay triangles of distinct points, each as three points {x, y}. */
  public static List<long[][]> triangulate(List<long[]> points) {
    List<long[]> pts = new ArrayList<>();
    pts.add(new long[] {-FAR, -FAR});
    pts.add(new long[] {FAR, -FAR});
    pts.add(new long[] {0, FAR});
    pts.addAll(points);
    List<int[]> tris = new ArrayList<>(); // vertex indices, counter-clockwise
    tris.add(new int[] {0, 1, 2});
    for (int k = 3; k < pts.size(); k++) {
      long[] p = pts.get(k);
      List<int[]> bad = new ArrayList<>(), keep = new ArrayList<>();
      for (int[] t : tris)
        (inCircle(pts.get(t[0]), pts.get(t[1]), pts.get(t[2]), p) > 0 ? bad : keep).add(t);
      Set<Long> edges = new HashSet<>();
      for (int[] t : bad) for (int i = 0; i < 3; i++) edges.add(key(t[i], t[(i + 1) % 3]));
      for (int[] t : bad) {
        for (int i = 0; i < 3; i++) {
          int u = t[i], w = t[(i + 1) % 3];
          if (!edges.contains(key(w, u))) keep.add(new int[] {u, w, k}); // an unshared edge
        }
      }
      tris = keep;
    }
    List<long[][]> out = new ArrayList<>();
    for (int[] t : tris)
      if (t[0] >= 3 && t[1] >= 3 && t[2] >= 3)
        out.add(new long[][] {pts.get(t[0]), pts.get(t[1]), pts.get(t[2])});
    return out;
  }

  private static long key(int u, int w) {
    return (long) u << 32 | w;
  }
}
