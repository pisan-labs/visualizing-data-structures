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
      double[] q = Motion.apply(m, p);
      row.add(fixed2(q[0]) + "," + fixed2(q[1]));
    }
    return row.toString();
  }

  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    double[][] shape = new double[0][];
    double[][] m = Motion.translation(0, 0);
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      if (parts[0].isEmpty()) continue;
      double[] n = new double[parts.length - 1];
      for (int i = 1; i < parts.length; i++) n[i - 1] = Double.parseDouble(parts[i]);
      switch (parts[0]) {
        case "shape" -> {
          shape = new double[n.length / 2][];
          for (int i = 0; i < shape.length; i++) shape[i] = new double[] {n[2 * i], n[2 * i + 1]};
          m = Motion.translation(0, 0);
        }
        case "order" -> {
          double[][] r = Motion.rotation(n[0]);
          double[][] t = Motion.translation(n[1], n[2]);
          double[][] first = Motion.multiply(t, Motion.multiply(r, m));
          double[][] second = Motion.multiply(r, Motion.multiply(t, m));
          out.append(show(first, shape)).append(" | ").append(show(second, shape)).append('\n');
        }
        case "rotate", "translate", "about", "invert" -> {
          double[][] a =
              switch (parts[0]) {
                case "rotate" -> Motion.rotation(n[0]);
                case "translate" -> Motion.translation(n[0], n[1]);
                case "about" -> Motion.rotationAbout(n[0], n[1], n[2]);
                default -> Motion.inverse(m);
              };
          m = Motion.multiply(a, m);
          out.append(show(m, shape)).append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
