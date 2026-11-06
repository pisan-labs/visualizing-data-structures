import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.List;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  static String nested(SuffixTree t, SuffixTree.Node u, boolean top) {
    StringJoiner inner = new StringJoiner(" ");
    for (SuffixTree.Node c : u.kids.values()) inner.add(nested(t, c, false));
    String label = top ? "" : t.label(u);
    return u.kids.isEmpty() ? label : label + "(" + inner + ")";
  }

  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      if (parts.length < 2) continue;
      SuffixTree t = new SuffixTree(parts[1]);
      switch (parts[0]) {
        case "build" -> out.append(nested(t, t.root, true)).append('\n');
        case "search" -> {
          List<Integer> found = t.search(parts[2]);
          StringJoiner j = new StringJoiner(" ");
          for (int x : found) j.add(String.valueOf(x));
          out.append(found.isEmpty() ? "none" : j.toString()).append('\n');
        }
        case "count" -> out.append(t.count(parts[2])).append('\n');
        case "repeat" -> {
          String r = t.longestRepeat();
          out.append(r.isEmpty() ? "none" : r).append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
