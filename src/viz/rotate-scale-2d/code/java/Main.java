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

  static String show(double[][] points) {
    StringJoiner row = new StringJoiner(" ");
    for (double[] p : points) row.add(fixed2(p[0]) + "," + fixed2(p[1]));
    return row.toString();
  }

  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    double[][] points = new double[0][];
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      double[] n = new double[parts.length - 1];
      for (int i = 1; i < parts.length; i++) n[i - 1] = Double.parseDouble(parts[i]);
      switch (parts[0]) {
        case "shape" -> {
          points = new double[n.length / 2][];
          for (int i = 0; i < points.length; i++) points[i] = new double[] {n[2 * i], n[2 * i + 1]};
        }
        case "rotate" -> {
          points = Transform.rotate(points, n[0], n[1], n[2]);
          out.append(show(points)).append('\n');
        }
        case "scale" -> {
          points = Transform.scale(points, n[0], n[1], n[2], n[3]);
          out.append(show(points)).append('\n');
        }
        case "order" -> {
          double[][] first =
              Transform.scale(Transform.rotate(points, n[0], n[3], n[4]), n[1], n[2], n[3], n[4]);
          double[][] second =
              Transform.rotate(Transform.scale(points, n[1], n[2], n[3], n[4]), n[0], n[3], n[4]);
          out.append(show(first)).append(" | ").append(show(second)).append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
