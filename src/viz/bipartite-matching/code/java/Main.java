import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    List<String> left = new ArrayList<>(), right = new ArrayList<>();
    Map<String, Integer> li = new HashMap<>(), ri = new HashMap<>();
    List<List<Integer>> adj = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "left" -> {
          left = List.of(p).subList(1, p.length);
          li = new HashMap<>();
          adj = new ArrayList<>();
          for (int i = 0; i < left.size(); i++) {
            li.put(left.get(i), i);
            adj.add(new ArrayList<>());
          }
        }
        case "right" -> {
          right = List.of(p).subList(1, p.length);
          ri = new HashMap<>();
          for (int i = 0; i < right.size(); i++) ri.put(right.get(i), i);
        }
        case "edge" -> adj.get(li.get(p[1])).add(ri.get(p[2]));
        case "match" -> {
          for (List<Integer> a : adj) Collections.sort(a);
          Matching m = new Matching(adj, right.size());
          String[] mate = new String[left.size()];
          for (int v = 0; v < right.size(); v++) if (m.matchR[v] >= 0) mate[m.matchR[v]] = right.get(v);
          StringBuilder pairs = new StringBuilder();
          for (int u = 0; u < left.size(); u++)
            if (mate[u] != null) pairs.append(' ').append(left.get(u)).append('-').append(mate[u]);
          out.append(m.size).append(" |").append(pairs).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
