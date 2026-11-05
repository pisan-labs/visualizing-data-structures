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
    List<int[]> edges = new ArrayList<>();
    boolean directed = false;
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "graph" -> {
          directed = p[1].equals("directed");
          names = List.of(p).subList(2, p.length);
          index = new HashMap<>();
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          edges = new ArrayList<>();
        }
        case "edge" -> {
          int u = index.get(p[1]), v = index.get(p[2]), w = Integer.parseInt(p[3]);
          edges.add(new int[] {u, v, w});
          if (!directed) edges.add(new int[] {v, u, w});
        }
        case "floyd" -> {
          int n = names.size();
          FloydWarshall r = new FloydWarshall(n, edges);
          StringJoiner d = new StringJoiner("; "), pi = new StringJoiner("; ");
          StringJoiner negative = new StringJoiner(" ");
          for (int i = 0; i < n; i++) {
            StringJoiner dr = new StringJoiner(" "), pr = new StringJoiner(" ");
            for (int j = 0; j < n; j++) {
              dr.add(r.d[i][j] == FloydWarshall.INF ? "inf" : String.valueOf(r.d[i][j]));
              pr.add(r.pi[i][j] == FloydWarshall.NIL ? "-" : names.get(r.pi[i][j]));
            }
            d.add(dr.toString());
            pi.add(pr.toString());
            if (r.d[i][i] < 0) negative.add(names.get(i));
          }
          out.append(d).append(" | ").append(pi);
          if (negative.length() > 0) out.append(" | negative cycle ").append(negative);
          out.append('\n');
        }
        case "path" -> {
          int n = names.size();
          FloydWarshall r = new FloydWarshall(n, edges);
          int i = index.get(p[1]), j = index.get(p[2]);
          boolean broken = false;
          for (int x = 0; x < n; x++)
            if (r.d[x][x] < 0 && r.d[i][x] != FloydWarshall.INF && r.d[x][j] != FloydWarshall.INF)
              broken = true;
          if (broken) out.append("negative cycle\n");
          else if (r.d[i][j] == FloydWarshall.INF) out.append("no path\n");
          else {
            StringJoiner s = new StringJoiner(" ");
            for (int v : r.path(i, j)) s.add(names.get(v));
            out.append(s).append('\n');
          }
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
