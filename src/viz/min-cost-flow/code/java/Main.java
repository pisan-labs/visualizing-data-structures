import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
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
    List<int[]> arcs = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          names = List.of(p).subList(1, p.length);
          index = new HashMap<>();
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          arcs = new ArrayList<>();
        }
        case "arc" -> arcs.add(new int[] {
          index.get(p[1]), index.get(p[2]), Integer.parseInt(p[3]), Integer.parseInt(p[4])
        });
        case "min-cost-flow" -> {
          int n = names.size();
          int[][] cap = new int[n][n], cost = new int[n][n];
          for (int[] a : arcs) {
            cap[a[0]][a[1]] = a[2];
            cost[a[0]][a[1]] = a[3];
          }
          MinCostFlow r = new MinCostFlow(cap, cost, index.get(p[1]), index.get(p[2]),
              Integer.parseInt(p[3]));
          StringJoiner flows = new StringJoiner(" ");
          for (int[] a : arcs)
            flows.add(names.get(a[0]) + ">" + names.get(a[1]) + ":" + Math.max(0, r.flow[a[0]][a[1]]));
          out.append(r.value).append(' ').append(r.total).append(" | ").append(r.paths)
              .append(" | ").append(flows).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
