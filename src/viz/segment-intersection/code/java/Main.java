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
      String[] t = line.trim().split("\\s+");
      if (!t[0].equals("segments")) continue;
      List<Segments.Seg> segs = new ArrayList<>();
      for (int i = 1; i + 3 < t.length; i += 4) {
        segs.add(
            new Segments.Seg(
                Long.parseLong(t[i]),
                Long.parseLong(t[i + 1]),
                Long.parseLong(t[i + 2]),
                Long.parseLong(t[i + 3])));
      }
      out.append(Segments.anySegmentsIntersect(segs) ? "yes" : "no").append('\n');
    }
    System.out.print(out);
  }
}
