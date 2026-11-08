import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      if (!parts[0].equals("closest")) continue;
      List<ClosestPair.Point> points = new ArrayList<>();
      for (int i = 1; i + 1 < parts.length; i += 2) {
        points.add(
            new ClosestPair.Point(Integer.parseInt(parts[i]), Integer.parseInt(parts[i + 1])));
      }
      out.append(points.size() < 2 ? "none" : String.valueOf(ClosestPair.closest(points)));
      out.append('\n');
    }
    System.out.print(out);
  }
}
