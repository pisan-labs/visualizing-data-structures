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
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          names = List.of(p).subList(2, p.length);
          index = new HashMap<>();
          adj = new ArrayList<>();
          for (int i = 0; i < names.size(); i++) {
            index.put(names.get(i), i);
            adj.add(new ArrayList<>());
          }
        }
        case "edge" -> adj.get(index.get(p[1])).add(index.get(p[2]));
        case "sort" -> {
          for (List<Integer> a : adj) Collections.sort(a);
          List<Integer> order = Topo.sort(adj);
          StringJoiner done = new StringJoiner(" "), left = new StringJoiner(" ");
          left.setEmptyValue("-");
          for (int u : order) done.add(names.get(u));
          for (int v = 0; v < names.size(); v++) if (!order.contains(v)) left.add(names.get(v));
          out.append((done + " | " + left).trim()).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
