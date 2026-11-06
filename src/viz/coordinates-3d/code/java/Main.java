import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  /** Two decimals, rounded half up the same way in every language. */
  static String fixed2(double x) {
    long r = (long) Math.floor(x * 100 + 0.5);
    long a = Math.abs(r);
    return (r < 0 ? "-" : "") + (a / 100) + "." + String.format("%02d", a % 100);
  }

  static String show(double[] p) {
    return fixed2(p[0]) + " " + fixed2(p[1]) + " " + fixed2(p[2]);
  }

  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    Frame3d frame = null;
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      double[] n = new double[parts.length - 1];
      for (int i = 1; i < parts.length; i++) n[i - 1] = Double.parseDouble(parts[i]);
      switch (parts[0]) {
        case "frame" ->
            frame =
                new Frame3d(
                    Arrays.copyOfRange(n, 0, 3),
                    Arrays.copyOfRange(n, 3, 6),
                    Arrays.copyOfRange(n, 6, 9),
                    Arrays.copyOfRange(n, 9, 12));
        case "local" -> out.append(show(frame.toLocal(n))).append('\n');
        case "world" -> out.append(show(frame.toWorld(n))).append('\n');
        default -> {}
      }
    }
    System.out.print(out);
  }
}
