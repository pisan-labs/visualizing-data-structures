import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/** Test driver: reads one reduction per line, prints the new instance on one line. */
public class Main {
  static Reductions.Graph readGraph(String[] parts) {
    Map<String, String> f = new HashMap<>();
    for (int i = 1; i < parts.length; i++) {
      String[] kv = parts[i].split("=", 2);
      f.put(kv[0], kv.length > 1 ? kv[1] : "");
    }
    List<String> vs = new ArrayList<>();
    for (String v : f.get("V").split(",")) if (!v.isEmpty()) vs.add(v);
    List<String[]> es = new ArrayList<>();
    for (String e : f.get("E").split(",")) if (!e.isEmpty()) es.add(e.split("-"));
    return new Reductions.Graph(vs, es, Integer.parseInt(f.get("k")));
  }

  static String show(Reductions.Graph g) {
    StringJoiner es = new StringJoiner(",");
    for (String[] e : g.edges()) es.add(e[0] + "-" + e[1]);
    return "k=" + g.k() + " V=" + String.join(",", g.vertices()) + " E=" + es;
  }

  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      if (parts.length < 2) continue;
      switch (parts[0]) {
        case "sat2is" -> {
          List<List<String>> clauses = new ArrayList<>();
          for (String c : parts[1].split(",")) clauses.add(Arrays.asList(c.split("\\|")));
          out.append(show(Reductions.satToIs(clauses))).append('\n');
        }
        case "is2vc" -> out.append(show(Reductions.isToVc(readGraph(parts)))).append('\n');
        case "is2clique" -> out.append(show(Reductions.isToClique(readGraph(parts)))).append('\n');
        case "clique2vc" -> out.append(show(Reductions.cliqueToVc(readGraph(parts)))).append('\n');
        case "vc2sc" -> {
          Reductions.Cover c = Reductions.vcToSc(readGraph(parts));
          StringBuilder sb = new StringBuilder("k=" + c.k() + " U=" + c.m());
          for (var e : c.sets().entrySet()) {
            StringJoiner items = new StringJoiner(",");
            for (int x : e.getValue()) items.add(String.valueOf(x));
            sb.append(' ').append(e.getKey()).append("={").append(items).append('}');
          }
          out.append(sb).append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
