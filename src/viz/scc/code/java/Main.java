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
    boolean directed = true;
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
        case "scc" -> {
          for (List<Integer> a : adj) Collections.sort(a);
          StringJoiner all = new StringJoiner(" | ");
          for (List<Integer> c : Scc.components(adj)) {
            StringJoiner one = new StringJoiner(" ");
            for (int v : c) one.add(names.get(v));
            all.add(one.toString());
          }
          out.append(all).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
