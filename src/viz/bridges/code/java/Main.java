import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    List<String> names = new ArrayList<>();
    Map<String, Integer> index = new HashMap<>();
    List<List<Integer>> adj = new ArrayList<>();
    List<int[]> edges = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
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
          adj.get(v).add(u);
        }
        case "cuts" -> {
          for (List<Integer> a : adj) Collections.sort(a);
          Bridges b = new Bridges(adj);
          StringJoiner cuts = new StringJoiner(" "), bridges = new StringJoiner(" ");
          for (int c : b.cuts) cuts.add(names.get(c));
          Set<String> found = new HashSet<>();
          for (int[] e : b.bridges) {
            found.add(Math.min(e[0], e[1]) + " " + Math.max(e[0], e[1]));
          }
          for (int[] e : edges) {
            if (found.contains(Math.min(e[0], e[1]) + " " + Math.max(e[0], e[1]))) {
              bridges.add(names.get(e[0]) + "-" + names.get(e[1]));
            }
          }
          out.append(cuts.length() > 0 ? cuts : "-").append(" | ");
          out.append(bridges.length() > 0 ? bridges : "-").append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
