import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. Components ignore
 * direction, so every edge goes in both lists.
 */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    Map<String, Integer> index = new HashMap<>();
    List<List<Integer>> adj = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          index = new HashMap<>();
          adj = new ArrayList<>();
          for (int i = 2; i < p.length; i++) {
            index.put(p[i], i - 2);
            adj.add(new ArrayList<>());
          }
        }
        case "edge" -> {
          int u = index.get(p[1]), v = index.get(p[2]);
          adj.get(u).add(v);
          adj.get(v).add(u);
        }
        case "components" -> {
          for (List<Integer> a : adj) Collections.sort(a);
          Components r = new Components(adj);
          StringJoiner cc = new StringJoiner(" ");
          for (int c : r.cc) cc.add(String.valueOf(c));
          out.append(r.count).append(" | ").append(cc).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
