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
    List<List<int[]>> adj = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          names = List.of(p).subList(1, p.length);
          index = new HashMap<>();
          adj = new ArrayList<>();
          for (int i = 0; i < names.size(); i++) {
            index.put(names.get(i), i);
            adj.add(new ArrayList<>());
          }
        }
        case "edge" -> {
          int u = index.get(p[1]), v = index.get(p[2]), w = Integer.parseInt(p[3]);
          adj.get(u).add(new int[] {v, w});
          adj.get(v).add(new int[] {u, w});
        }
        case "prim" -> {
          for (List<int[]> a : adj) a.sort((x, y) -> Integer.compare(x[0], y[0]));
          Prim r = new Prim(adj, index.get(p[1]));
          StringJoiner pi = new StringJoiner(" ");
          for (int x : r.pi) pi.add(x == Prim.NIL ? "-" : names.get(x));
          out.append(r.total).append(" | ").append(pi).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
