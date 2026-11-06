import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  /** Two decimals, rounded half up the same way in every language. */
  static String fixed2(double x) {
    long r = (long) Math.floor(x * 100 + 0.5);
    long a = Math.abs(r);
    return (r < 0 ? "-" : "") + (a / 100) + "." + String.format("%02d", a % 100);
  }

  static String show(double[][] m, double[][] shape) {
    StringJoiner row = new StringJoiner(" ");
    for (double[] p : shape) {
      double[] q = Transform3d.apply(m, p);
      row.add(fixed2(q[0]) + "," + fixed2(q[1]) + "," + fixed2(q[2]));
    }
    return row.toString();
  }

  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    double[][] shape = new double[0][];
    double[][] m = Transform3d.scaling(1, 1, 1);
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      switch (parts[0]) {
        case "shape" -> {
          shape = new double[(parts.length - 1) / 3][];
          for (int i = 0; i < shape.length; i++) {
            shape[i] = new double[3];
            for (int k = 0; k < 3; k++) shape[i][k] = Double.parseDouble(parts[1 + 3 * i + k]);
          }
          m = Transform3d.scaling(1, 1, 1);
        }
        case "rotate" -> {
          m = Transform3d.multiply(Transform3d.rotation(parts[1].charAt(0), Double.parseDouble(parts[2])), m);
          out.append(show(m, shape)).append('\n');
        }
        case "scale" -> {
          double[][] s =
              Transform3d.scaling(
                  Double.parseDouble(parts[1]), Double.parseDouble(parts[2]), Double.parseDouble(parts[3]));
          m = Transform3d.multiply(s, m);
          out.append(show(m, shape)).append('\n');
        }
        case "order" -> {
          double deg = Double.parseDouble(parts[1]);
          double[][] rx = Transform3d.rotation('x', deg), ry = Transform3d.rotation('y', deg);
          double[][] first = Transform3d.multiply(ry, Transform3d.multiply(rx, m));
          double[][] second = Transform3d.multiply(rx, Transform3d.multiply(ry, m));
          out.append(show(first, shape)).append(" | ").append(show(second, shape)).append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
