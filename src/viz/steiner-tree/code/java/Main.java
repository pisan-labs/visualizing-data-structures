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
    int[][] w = new int[0][0];
    List<Integer> terminals = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          names = List.of(p).subList(1, p.length);
          index = new HashMap<>();
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          w = new int[names.size()][names.size()];
        }
        case "edge" -> {
          int u = index.get(p[1]), v = index.get(p[2]);
          w[u][v] = w[v][u] = Integer.parseInt(p[3]);
        }
        case "terminals" -> {
          terminals = new ArrayList<>();
          for (int i = 1; i < p.length; i++) terminals.add(index.get(p[i]));
          terminals.sort(null);
        }
        case "steiner" -> {
          List<int[]> tree = Steiner.approx(w, terminals);
          long weight = 0;
          StringJoiner edges = new StringJoiner(" ");
          for (int[] e : tree) {
            weight += w[e[0]][e[1]];
            edges.add(names.get(e[0]) + "-" + names.get(e[1]));
          }
          String shown = tree.isEmpty() ? "-" : edges.toString();
          out.append(weight).append(" | ").append(shown).append(" | ");
          out.append(Steiner.exactWeight(w, terminals)).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
