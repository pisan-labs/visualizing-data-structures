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
    List<int[]> arcs = new ArrayList<>();
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
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          arcs = new ArrayList<>();
        }
        case "edge" -> {
          int u = index.get(p[1]);
          int v = index.get(p[2]);
          int w = Integer.parseInt(p[3]);
          arcs.add(new int[] {u, v, w});
          if (!directed) arcs.add(new int[] {v, u, w});
        }
        case "johnson" -> {
          long[][] dist = Johnson.allPairs(names.size(), arcs);
          if (dist == null) {
            out.append("negative cycle\n");
            break;
          }
          List<String> rows = new ArrayList<>();
          for (long[] row : dist) {
            List<String> cells = new ArrayList<>();
            for (long x : row) cells.add(x == Johnson.INF ? "INF" : Long.toString(x));
            rows.add(String.join(" ", cells));
          }
          out.append(String.join(" | ", rows)).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
