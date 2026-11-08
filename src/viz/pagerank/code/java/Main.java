import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  static String three(double x) {
    long k = (long) Math.floor(x * 1000 + 0.5);
    return String.format("%d.%03d", k / 1000, k % 1000);
  }

  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    List<String> names = new ArrayList<>();
    Map<String, Integer> index = new HashMap<>();
    List<List<Integer>> links = new ArrayList<>();
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
          links = new ArrayList<>();
          for (int i = 0; i < names.size(); i++) {
            index.put(names.get(i), i);
            links.add(new ArrayList<>());
          }
        }
        case "edge" -> {
          int u = index.get(p[1]);
          int v = index.get(p[2]);
          links.get(u).add(v);
          if (!directed) links.get(v).add(u);
        }
        case "pagerank" -> {
          PageRank pr =
              new PageRank(names.size(), links, Double.parseDouble(p[1]), p[2].equals("spread"));
          out.append(pr.iterations).append(" |");
          for (double x : pr.rank) out.append(' ').append(three(x));
          out.append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
