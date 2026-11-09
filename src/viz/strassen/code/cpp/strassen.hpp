#include <vector>

// Strassen's algorithm for n x n matrices (CLRS 4.2), padding n up to a power of 2. It counts the
// scalar multiplications and additions it makes.
using Matrix = std::vector<std::vector<int>>;

struct Strassen {
  long mults = 0;
  long adds = 0;

  // A·B, padded to a power of 2 and cut back to n x n.
  Matrix multiply(const Matrix& a, const Matrix& b) {
    int n = static_cast<int>(a.size());
    int size = 1;
    while (size < n) size *= 2;
    Matrix c = strassen(pad(a, size), pad(b, size));
    c.resize(n);
    for (auto& row : c) row.resize(n);
    return c;
  }

  Matrix strassen(const Matrix& a, const Matrix& b) {
    int n = static_cast<int>(a.size());
    if (n == 1) {
      mults++;
      return {{a[0][0] * b[0][0]}};
    }
    int h = n / 2;
    Matrix a11 = block(a, 0, 0), a12 = block(a, 0, h), a21 = block(a, h, 0), a22 = block(a, h, h);
    Matrix b11 = block(b, 0, 0), b12 = block(b, 0, h), b21 = block(b, h, 0), b22 = block(b, h, h);
    Matrix s1 = add(b12, b22, -1), s2 = add(a11, a12, 1), s3 = add(a21, a22, 1);
    Matrix s4 = add(b21, b11, -1), s5 = add(a11, a22, 1), s6 = add(b11, b22, 1);
    Matrix s7 = add(a12, a22, -1), s8 = add(b21, b22, 1);
    Matrix s9 = add(a11, a21, -1), s10 = add(b11, b12, 1);
    Matrix p1 = strassen(a11, s1);
    Matrix p2 = strassen(s2, b22);
    Matrix p3 = strassen(s3, b11);
    Matrix p4 = strassen(a22, s4);
    Matrix p5 = strassen(s5, s6);
    Matrix p6 = strassen(s7, s8);
    Matrix p7 = strassen(s9, s10);
    Matrix c11 = add(add(add(p5, p4, 1), p2, -1), p6, 1);
    Matrix c12 = add(p1, p2, 1);
    Matrix c21 = add(p3, p4, 1);
    Matrix c22 = add(add(add(p5, p1, 1), p3, -1), p7, -1);
    Matrix c(n, std::vector<int>(n));
    for (int i = 0; i < h; i++)
      for (int j = 0; j < h; j++) {
        c[i][j] = c11[i][j];
        c[i][j + h] = c12[i][j];
        c[i + h][j] = c21[i][j];
        c[i + h][j + h] = c22[i][j];
      }
    return c;
  }

  static Matrix block(const Matrix& m, int r, int c) {
    int h = static_cast<int>(m.size()) / 2;
    Matrix out(h, std::vector<int>(h));
    for (int i = 0; i < h; i++)
      for (int j = 0; j < h; j++) out[i][j] = m[r + i][c + j];
    return out;
  }

  Matrix add(const Matrix& x, const Matrix& y, int sign) {
    int h = static_cast<int>(x.size());
    adds += static_cast<long>(h) * h;
    Matrix out(h, std::vector<int>(h));
    for (int i = 0; i < h; i++)
      for (int j = 0; j < h; j++) out[i][j] = x[i][j] + sign * y[i][j];
    return out;
  }

  static Matrix pad(const Matrix& m, int size) {
    Matrix out(size, std::vector<int>(size, 0));
    for (size_t i = 0; i < m.size(); i++)
      for (size_t j = 0; j < m.size(); j++) out[i][j] = m[i][j];
    return out;
  }
};
