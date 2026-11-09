/**
 * Strassen's algorithm for n x n matrices (CLRS 4.2), padding n up to a power of 2. It counts the
 * scalar multiplications and additions it makes.
 */
public class Strassen {
  public long mults = 0;
  public long adds = 0;

  /** A·B, padded to a power of 2 and cut back to n x n. */
  public int[][] multiply(int[][] a, int[][] b) {
    int n = a.length;
    int size = 1;
    while (size < n) size *= 2;
    int[][] c = strassen(pad(a, size), pad(b, size));
    int[][] out = new int[n][n];
    for (int i = 0; i < n; i++) System.arraycopy(c[i], 0, out[i], 0, n);
    return out;
  }

  private int[][] strassen(int[][] a, int[][] b) {
    int n = a.length;
    if (n == 1) {
      mults++;
      return new int[][] {{a[0][0] * b[0][0]}};
    }
    int h = n / 2;
    int[][] a11 = block(a, 0, 0), a12 = block(a, 0, h), a21 = block(a, h, 0), a22 = block(a, h, h);
    int[][] b11 = block(b, 0, 0), b12 = block(b, 0, h), b21 = block(b, h, 0), b22 = block(b, h, h);
    int[][] s1 = add(b12, b22, -1), s2 = add(a11, a12, 1), s3 = add(a21, a22, 1);
    int[][] s4 = add(b21, b11, -1), s5 = add(a11, a22, 1), s6 = add(b11, b22, 1);
    int[][] s7 = add(a12, a22, -1), s8 = add(b21, b22, 1);
    int[][] s9 = add(a11, a21, -1), s10 = add(b11, b12, 1);
    int[][] p1 = strassen(a11, s1);
    int[][] p2 = strassen(s2, b22);
    int[][] p3 = strassen(s3, b11);
    int[][] p4 = strassen(a22, s4);
    int[][] p5 = strassen(s5, s6);
    int[][] p6 = strassen(s7, s8);
    int[][] p7 = strassen(s9, s10);
    int[][] c11 = add(add(add(p5, p4, 1), p2, -1), p6, 1);
    int[][] c12 = add(p1, p2, 1);
    int[][] c21 = add(p3, p4, 1);
    int[][] c22 = add(add(add(p5, p1, 1), p3, -1), p7, -1);
    int[][] c = new int[n][n];
    for (int i = 0; i < h; i++)
      for (int j = 0; j < h; j++) {
        c[i][j] = c11[i][j];
        c[i][j + h] = c12[i][j];
        c[i + h][j] = c21[i][j];
        c[i + h][j + h] = c22[i][j];
      }
    return c;
  }

  private static int[][] block(int[][] m, int r, int c) {
    int h = m.length / 2;
    int[][] out = new int[h][h];
    for (int i = 0; i < h; i++) System.arraycopy(m[r + i], c, out[i], 0, h);
    return out;
  }

  private int[][] add(int[][] x, int[][] y, int sign) {
    int h = x.length;
    adds += (long) h * h;
    int[][] out = new int[h][h];
    for (int i = 0; i < h; i++) for (int j = 0; j < h; j++) out[i][j] = x[i][j] + sign * y[i][j];
    return out;
  }

  private static int[][] pad(int[][] m, int size) {
    int[][] out = new int[size][size];
    for (int i = 0; i < m.length; i++) System.arraycopy(m[i], 0, out[i], 0, m.length);
    return out;
  }
}
