/** A frame is an origin o and three axes u, v, w, all in world coordinates. */
public class Frame3d {
  final double[] o, u, v, w;

  Frame3d(double[] o, double[] u, double[] v, double[] w) {
    this.o = o;
    this.u = u;
    this.v = v;
    this.w = w;
  }

  static double dot(double[] a, double[] b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  static double[] cross(double[] a, double[] b) {
    return new double[] {
      a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
    };
  }

  /** The world point with frame coordinates q = (a, b, c): o + a u + b v + c w. */
  double[] toWorld(double[] q) {
    double[] p = new double[3];
    for (int i = 0; i < 3; i++) p[i] = o[i] + q[0] * u[i] + q[1] * v[i] + q[2] * w[i];
    return p;
  }

  /** p in the frame's coordinates: M^-1 (p - o), with M^-1 built from cross products. */
  double[] toLocal(double[] p) {
    double det = dot(u, cross(v, w));
    if (Math.abs(det) < 1e-9) throw new IllegalStateException("the axes lie in one plane");
    double[] d = {p[0] - o[0], p[1] - o[1], p[2] - o[2]};
    return new double[] {
      dot(d, cross(v, w)) / det, dot(d, cross(w, u)) / det, dot(d, cross(u, v)) / det
    };
  }

  /** The shortcut for perpendicular unit axes: M^-1 = M^T, so three dot products. */
  double[] toLocalOrthonormal(double[] p) {
    double[] d = {p[0] - o[0], p[1] - o[1], p[2] - o[2]};
    return new double[] {dot(u, d), dot(v, d), dot(w, d)};
  }
}
