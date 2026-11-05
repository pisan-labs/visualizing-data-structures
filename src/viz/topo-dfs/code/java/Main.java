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
        case "topo" -> {
          for (List<Integer> a : adj) Collections.sort(a);
          try {
            StringJoiner order = new StringJoiner(" ");
            for (int u : Topo.sort(adj)) order.add(names.get(u));
            out.append(order).append('\n');
          } catch (Topo.CycleException e) {
            out.append("cycle ").append(names.get(e.u)).append(' ').append(names.get(e.v));
            out.append('\n');
          }
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
