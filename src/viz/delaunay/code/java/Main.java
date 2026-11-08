import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] t = line.trim().split("\\s+");
      if (!t[0].equals("delaunay")) continue;
      List<long[]> points = new ArrayList<>();
      for (int i = 1; i + 1 < t.length; i += 2)
        points.add(new long[] {Long.parseLong(t[i]), Long.parseLong(t[i + 1])});
      List<String> rows = new ArrayList<>();
      for (long[][] tri : Delaunay.triangulate(points)) {
        Arrays.sort(tri, (a, b) -> a[0] != b[0] ? Long.compare(a[0], b[0]) : Long.compare(a[1], b[1]));
        rows.add(tri[0][0] + "," + tri[0][1] + " " + tri[1][0] + "," + tri[1][1] + " " + tri[2][0] + "," + tri[2][1]);
      }
      Collections.sort(rows);
      out.append(rows.isEmpty() ? "none" : String.join(" | ", rows)).append('\n');
    }
    System.out.print(out);
  }
}
