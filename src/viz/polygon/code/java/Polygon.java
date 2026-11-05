public class Polygon {
  /** Positive if a -> b -> c turns left, negative if right, 0 if collinear. */
  static long turn(int[] a, int[] b, int[] c) {
    return (long) (b[0] - a[0]) * (c[1] - a[1]) - (long) (b[1] - a[1]) * (c[0] - a[0]);
  }

  /** Twice the signed area (shoelace): positive when counter-clockwise. */
  public static long area2(int[][] p) {
    long sum = 0;
    for (int i = 0; i < p.length; i++) {
      int[] a = p[i], b = p[(i + 1) % p.length];
      sum += (long) a[0] * b[1] - (long) b[0] * a[1];
    }
    return sum;
  }

  /** "ccw", "cw" or "degenerate", from the turn at the lowest vertex. */
  public static String orientation(int[][] p) {
    int n = p.length, k = 0;
    for (int i = 1; i < n; i++) {
      if (p[i][1] < p[k][1] || (p[i][1] == p[k][1] && p[i][0] < p[k][0])) k = i;
    }
    long t = turn(p[(k - 1 + n) % n], p[k], p[(k + 1) % n]);
    return t > 0 ? "ccw" : t < 0 ? "cw" : "degenerate";
  }

  /** Every turn goes the same way, and the turns add up to one full circle. */
  public static boolean isConvex(int[][] p) {
    int n = p.length, sign = 0;
    double total = 0;
    for (int i = 0; i < n; i++) {
      int[] a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
      long t = turn(a, b, c);
      long d = (long) (b[0] - a[0]) * (c[0] - b[0]) + (long) (b[1] - a[1]) * (c[1] - b[1]);
      if ((t > 0 && sign < 0) || (t < 0 && sign > 0) || (t == 0 && d < 0)) return false;
      if (sign == 0 && t != 0) sign = t > 0 ? 1 : -1;
      total += Math.atan2(t, d);
    }
    return Math.round(Math.abs(total) / (2 * Math.PI)) == 1;
  }

  static boolean onSegment(int[] a, int[] b, int[] q) {
    return turn(a, b, q) == 0
        && Math.min(a[0], b[0]) <= q[0] && q[0] <= Math.max(a[0], b[0])
        && Math.min(a[1], b[1]) <= q[1] && q[1] <= Math.max(a[1], b[1]);
  }

  /** "inside", "outside" or "boundary", by counting crossings of a ray to the right. */
  public static String rayCast(int[][] p, int[] q) {
    boolean inside = false;
    for (int i = 0; i < p.length; i++) {
      int[] a = p[i], b = p[(i + 1) % p.length];
      if (onSegment(a, b, q)) return "boundary";
      if ((a[1] > q[1]) != (b[1] > q[1])) {
        double x = a[0] + (double) (q[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
        if (q[0] < x) inside = !inside;
      }
    }
    return inside ? "inside" : "outside";
  }

  /** "inside", "outside" or "boundary", by the nonzero winding rule. */
  public static String windingNumber(int[][] p, int[] q) {
    int w = 0;
    for (int i = 0; i < p.length; i++) {
      int[] a = p[i], b = p[(i + 1) % p.length];
      if (onSegment(a, b, q)) return "boundary";
      if (a[1] <= q[1] && q[1] < b[1] && turn(a, b, q) > 0) w++;
      else if (b[1] <= q[1] && q[1] < a[1] && turn(a, b, q) < 0) w--;
    }
    return w != 0 ? "inside" : "outside";
  }
}
