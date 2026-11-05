/** A 2D frame: an origin o and axes u, v, all in world coordinates. */
public class Frame {
  final double ox, oy, ux, uy, vx, vy, det;

  public Frame(double ox, double oy, double ux, double uy, double vx, double vy) {
    this.ox = ox;
    this.oy = oy;
    this.ux = ux;
    this.uy = uy;
    this.vx = vx;
    this.vy = vy;
    this.det = ux * vy - vx * uy;
    if (det == 0) throw new IllegalArgumentException("the axes are parallel");
  }

  /** World point of the frame coordinates (a, b): o + a*u + b*v. */
  public double[] toWorld(double a, double b) {
    return new double[] {ox + a * ux + b * vx, oy + a * uy + b * vy};
  }

  /** Frame coordinates of the world point (x, y): M^-1 (p - o), by Cramer's rule. */
  public double[] toLocal(double x, double y) {
    double dx = x - ox, dy = y - oy;
    return new double[] {(dx * vy - vx * dy) / det, (ux * dy - dx * uy) / det};
  }
}
