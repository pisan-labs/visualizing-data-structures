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
    List<List<Integer>> adj = new ArrayList<>();
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
          adj = new ArrayList<>();
          for (int i = 0; i < names.size(); i++) {
            index.put(names.get(i), i);
            adj.add(new ArrayList<>());
          }
        }
        case "edge" -> {
          int u = index.get(p[1]), v = index.get(p[2]);
          adj.get(u).add(v);
          if (!directed) adj.get(v).add(u);
        }
        case "bfs" -> {
          for (List<Integer> a : adj) Collections.sort(a);
          Bfs r = new Bfs(adj, index.get(p[1]));
          StringJoiner order = new StringJoiner(" "), d = new StringJoiner(" ");
          StringJoiner pi = new StringJoiner(" ");
          for (int u : r.order) order.add(names.get(u));
          for (int x : r.d) d.add(x == Bfs.INF ? "inf" : String.valueOf(x));
          for (int x : r.pi) pi.add(x == Bfs.NIL ? "-" : names.get(x));
          out.append(order).append(" | ").append(d).append(" | ").append(pi).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
