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
    int[][] d = new int[0][0];
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          names = List.of(p).subList(1, p.length);
          index = new HashMap<>();
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          d = new int[names.size()][names.size()];
        }
        case "edge" -> {
          int u = index.get(p[1]), v = index.get(p[2]);
          d[u][v] = d[v][u] = Integer.parseInt(p[3]);
        }
        case "tsp" -> {
          List<Integer> tour = Tsp.approxTour(d);
          StringJoiner cities = new StringJoiner(" ");
          for (int c : tour) cities.add(names.get(c));
          out.append(cities).append(" | ").append(Tsp.length(d, tour));
          out.append(" | ").append(Tsp.heldKarp(d)).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
