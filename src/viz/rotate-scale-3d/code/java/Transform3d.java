/** 3x3 matrices act on column vectors (x, y, z): p' = M p. */
public class Transform3d {
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

  /** Counter-clockwise about the axis, seen with the axis pointing at you. */
  public static double[][] rotation(char axis, double degrees) {
    double theta = degrees * Math.PI / 180;
    double c = Math.cos(theta), s = Math.sin(theta);
    return switch (axis) {
      case 'x' -> new double[][] {{1, 0, 0}, {0, c, -s}, {0, s, c}};
      case 'y' -> new double[][] {{c, 0, s}, {0, 1, 0}, {-s, 0, c}};
      default -> new double[][] {{c, -s, 0}, {s, c, 0}, {0, 0, 1}};
    };
  }

  public static double[][] scaling(double sx, double sy, double sz) {
    return new double[][] {{sx, 0, 0}, {0, sy, 0}, {0, 0, sz}};
  }

  public static double[] apply(double[][] m, double[] p) {
    double[] out = new double[3];
    for (int i = 0; i < 3; i++) out[i] = m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2];
    return out;
  }
}
