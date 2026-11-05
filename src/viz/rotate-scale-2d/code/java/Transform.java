public class Transform {
  /** Rotate points counter-clockwise by degrees about (cx, cy): p' = c + R (p - c). */
  public static double[][] rotate(double[][] points, double degrees, double cx, double cy) {
    double theta = degrees * Math.PI / 180;
    double cos = Math.cos(theta), sin = Math.sin(theta);
    double[][] out = new double[points.length][];
    for (int i = 0; i < points.length; i++) {
      double dx = points[i][0] - cx, dy = points[i][1] - cy;
      out[i] = new double[] {cx + (cos * dx - sin * dy), cy + (sin * dx + cos * dy)};
    }
    return out;
  }

  /** Scale points by sx in x and sy in y about (cx, cy): p' = c + S (p - c). */
  public static double[][] scale(double[][] points, double sx, double sy, double cx, double cy) {
    double[][] out = new double[points.length][];
    for (int i = 0; i < points.length; i++) {
      out[i] = new double[] {cx + sx * (points[i][0] - cx), cy + sy * (points[i][1] - cy)};
    }
    return out;
  }
}
