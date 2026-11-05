import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      String op = parts[0];
      if (op.isEmpty()) continue;
      int from = op.equals("inside") || op.equals("winding") ? 3 : 1;
      int[] q = from == 3 ? new int[] {Integer.parseInt(parts[1]), Integer.parseInt(parts[2])} : null;
      int[][] p = new int[(parts.length - from) / 2][];
      for (int i = 0; i < p.length; i++) {
        p[i] = new int[] {
          Integer.parseInt(parts[from + 2 * i]), Integer.parseInt(parts[from + 2 * i + 1])
        };
      }
      String result =
          switch (op) {
            case "area" -> {
              long s = Math.abs(Polygon.area2(p));
              yield (s / 2) + (s % 2 == 1 ? ".5" : "");
            }
            case "orient" -> Polygon.orientation(p);
            case "convex" -> Polygon.isConvex(p) ? "yes" : "no";
            case "inside" -> Polygon.rayCast(p, q);
            case "winding" -> Polygon.windingNumber(p, q);
            default -> null;
          };
      if (result != null) out.append(result).append('\n');
    }
    System.out.print(out);
  }
}
