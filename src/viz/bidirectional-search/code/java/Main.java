import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    List<String> names = new ArrayList<>();
    Map<String, Integer> index = new HashMap<>();
    List<List<Integer>> adj = new ArrayList<>();
    List<List<Integer>> radj = new ArrayList<>();
    boolean directed = false;
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          directed = p[1].equals("d");
          names = List.of(p).subList(2, p.length);
          index = new HashMap<>();
          adj = new ArrayList<>();
          radj = new ArrayList<>();
          for (int i = 0; i < names.size(); i++) {
            index.put(names.get(i), i);
            adj.add(new ArrayList<>());
            radj.add(new ArrayList<>());
          }
        }
        case "edge" -> {
          int u = index.get(p[1]);
          int v = index.get(p[2]);
          adj.get(u).add(v);
          radj.get(v).add(u);
          if (!directed) {
            adj.get(v).add(u);
            radj.get(u).add(v);
          }
        }
        case "search" -> {
          for (List<Integer> row : adj) Collections.sort(row);
          for (List<Integer> row : radj) Collections.sort(row);
          Bidirectional b = new Bidirectional(adj, radj, index.get(p[1]), index.get(p[2]));
          if (b.path == null) {
            out.append("none | ").append(b.expanded).append('\n');
          } else {
            out.append(b.path.size() - 1).append(" |");
            for (int v : b.path) out.append(' ').append(names.get(v));
            out.append(" | ").append(b.expanded).append('\n');
          }
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
