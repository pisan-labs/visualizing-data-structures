import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.List;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  static String join(Iterable<?> xs) {
    StringJoiner j = new StringJoiner(" ");
    for (Object x : xs) j.add(String.valueOf(x));
    return j.toString();
  }

  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      if (parts.length < 2) continue;
      SuffixArray s = new SuffixArray(parts[1]);
      switch (parts[0]) {
        case "build" -> {
          StringJoiner lcp = new StringJoiner(" ");
          for (int x : s.lcp) lcp.add(String.valueOf(x));
          out.append(join(List.of(s.sa))).append(" | ").append(lcp).append('\n');
        }
        case "search" -> {
          List<Integer> found = s.search(parts[2]);
          out.append(found.isEmpty() ? "none" : join(found)).append('\n');
        }
        case "repeat" -> {
          String r = s.longestRepeat();
          out.append(r.isEmpty() ? "none" : r).append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
