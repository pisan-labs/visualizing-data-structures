import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      if (!parts[0].equals("hull")) continue;
      List<ConvexHull.Point> points = new ArrayList<>();
      for (int i = 1; i + 1 < parts.length; i += 2) {
        points.add(
            new ConvexHull.Point(Integer.parseInt(parts[i]), Integer.parseInt(parts[i + 1])));
      }
      List<ConvexHull.Point> hull = ConvexHull.grahamScan(points);
      StringJoiner row = new StringJoiner(" ");
      for (ConvexHull.Point p : hull) row.add(p.x() + "," + p.y());
      out.append(hull.isEmpty() ? "empty" : row.toString()).append('\n');
    }
    System.out.print(out);
  }
}
