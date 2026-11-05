import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
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
    boolean directed = false;
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          directed = p[1].equals("directed");
          names = List.of(p).subList(2, p.length);
          index = new HashMap<>();
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          edges = new ArrayList<>();
        }
        case "edge" -> {
          int u = index.get(p[1]), v = index.get(p[2]), w = Integer.parseInt(p[3]);
          edges.add(new int[] {u, v, w});
          if (!directed) edges.add(new int[] {v, u, w});
        }
        case "bellman-ford" -> {
          edges.sort((a, b) -> a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]));
          BellmanFord r = new BellmanFord(names.size(), edges, index.get(p[1]));
          StringJoiner d = new StringJoiner(" "), pi = new StringJoiner(" ");
          for (long x : r.d) d.add(x == BellmanFord.INF ? "inf" : String.valueOf(x));
          for (int x : r.pi) pi.add(x == BellmanFord.NIL ? "-" : names.get(x));
          out.append(d).append(" | ").append(pi);
          if (r.cycle != null) {
            int k = r.cycle.indexOf(Collections.min(r.cycle));
            StringJoiner c = new StringJoiner(" ");
            for (int i = 0; i < r.cycle.size(); i++)
              c.add(names.get(r.cycle.get((k + i) % r.cycle.size())));
            out.append(" | negative cycle ").append(c);
          }
          out.append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
