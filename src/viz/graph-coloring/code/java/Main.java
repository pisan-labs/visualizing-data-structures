import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
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
          int u = index.get(p[1]);
          int v = index.get(p[2]);
          adj.get(u).add(v);
          adj.get(v).add(u);
        }
        case "color" -> {
          int[] color = Coloring.greedyColor(names.size(), adj);
          int k = 0;
          StringBuilder row = new StringBuilder();
          for (int c : color) {
            k = Math.max(k, c);
            row.append(' ').append(c);
          }
          out.append(k).append(" |").append(row).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
