/** A rigid motion is a 3x3 matrix acting on (x, y, 1): [cos -sin tx; sin cos ty; 0 0 1]. */
public class Motion {
  /** The product a b: apply b first, then a. */
  public static double[][] multiply(double[][] a, double[][] b) {
    double[][] out = new double[3][3];
    for (int i = 0; i < 3; i++) {
      for (int j = 0; j < 3; j++) {
        out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
      }
    }
    return out;
  }

  /** Counter-clockwise about the origin. */
  public static double[][] rotation(double degrees) {
    double theta = degrees * Math.PI / 180;
    double c = Math.cos(theta), s = Math.sin(theta);
    return new double[][] {{c, -s, 0}, {s, c, 0}, {0, 0, 1}};
  }

  public static double[][] translation(double tx, double ty) {
    return new double[][] {{1, 0, tx}, {0, 1, ty}, {0, 0, 1}};
  }

  /** Slide c to the origin, rotate, slide back: T(c) R T(-c). */
  public static double[][] rotationAbout(double degrees, double cx, double cy) {
    return multiply(translation(cx, cy), multiply(rotation(degrees), translation(-cx, -cy)));
  }

  /** Undo p' = R p + t with p = R^T p' - R^T t. No division needed. */
  public static double[][] inverse(double[][] m) {
    double tx = m[0][2], ty = m[1][2];
    return new double[][] {
      {m[0][0], m[1][0], -(m[0][0] * tx + m[1][0] * ty)},
      {m[0][1], m[1][1], -(m[0][1] * tx + m[1][1] * ty)},
      {0, 0, 1}
    };
  }

  public static double[] apply(double[][] m, double[] p) {
    return new double[] {
      m[0][0] * p[0] + m[0][1] * p[1] + m[0][2], m[1][0] * p[0] + m[1][1] * p[1] + m[1][2]
    };
  }
}
