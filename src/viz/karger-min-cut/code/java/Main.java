import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    List<String> names = new ArrayList<>();
    Map<String, Integer> index = new HashMap<>();
    List<int[]> edges = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          names = List.of(p).subList(1, p.length);
          index = new HashMap<>();
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          edges = new ArrayList<>();
        }
        case "edge" -> edges.add(new int[] {index.get(p[1]), index.get(p[2])});
        case "karger" -> {
          int[] draws = new int[p.length - 1];
          for (int i = 1; i < p.length; i++) draws[i - 1] = Integer.parseInt(p[i]);
          int[] next = {0};
          Karger k = new Karger(names.size(), edges, (lo, hi) -> {
            int d = draws[next[0]++];
            if (d < lo || d > hi) throw new IllegalStateException("draw out of range");
            return d;
          });
          StringJoiner side = new StringJoiner(" "), rest = new StringJoiner(" ");
          for (int v = 0; v < names.size(); v++)
            (k.group[v] == k.group[0] ? side : rest).add(names.get(v));
          out.append((k.cut.size() + " | " + side + " | " + rest).stripTrailing()).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
