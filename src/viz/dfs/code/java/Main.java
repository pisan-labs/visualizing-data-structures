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
          adj = new ArrayList<>();
          edges = new ArrayList<>();
          for (int i = 0; i < names.size(); i++) {
            index.put(names.get(i), i);
            adj.add(new ArrayList<>());
          }
        }
        case "edge" -> {
          int u = index.get(p[1]), v = index.get(p[2]);
          edges.add(new int[] {u, v});
          adj.get(u).add(v);
          if (!directed) adj.get(v).add(u);
        }
        case "dfs" -> {
          for (List<Integer> a : adj) Collections.sort(a);
          Dfs r = new Dfs(adj, index.get(p[1]), directed);
          StringJoiner d = new StringJoiner(" "), f = new StringJoiner(" ");
          StringJoiner pi = new StringJoiner(" "), kinds = new StringJoiner(" ");
          for (int x : r.d) d.add(String.valueOf(x));
          for (int x : r.f) f.add(String.valueOf(x));
          for (int x : r.pi) pi.add(x == Dfs.NIL ? "-" : names.get(x));
          for (int[] e : edges) {
            Dfs.Kind k = r.kind.get(e[0] + " " + e[1]);
            if (k == null) k = r.kind.get(e[1] + " " + e[0]);
            kinds.add(names.get(e[0]) + "-" + names.get(e[1]) + ":" + k.name().charAt(0));
          }
          out.append(d).append(" | ").append(f).append(" | ").append(pi).append(" | ")
              .append(kinds).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
