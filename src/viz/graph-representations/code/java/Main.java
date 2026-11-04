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
    AdjacencyList list = null;
    AdjacencyMatrix matrix = null;
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      if (p[0].isEmpty()) continue;
      if (p[0].equals("graph")) {
        boolean directed = p[1].equals("directed");
        names = new ArrayList<>(List.of(p).subList(2, p.length));
        index = new HashMap<>();
        for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
        list = new AdjacencyList(names.size(), directed);
        matrix = new AdjacencyMatrix(names.size(), directed);
        continue;
      }
      int u = index.get(p[1]);
      int v = p.length > 2 ? index.get(p[2]) : -1;
      switch (p[0]) {
        case "edge" -> {
          list.addEdge(u, v);
          matrix.addEdge(u, v);
        }
        case "has" -> out.append(yes(list.hasEdge(u, v), "yes", "no"))
            .append(' ').append(yes(matrix.hasEdge(u, v), "yes", "no")).append('\n');
        case "add" -> out.append(yes(list.addEdge(u, v), "added", "exists"))
            .append(' ').append(yes(matrix.addEdge(u, v), "added", "exists")).append('\n');
        case "remove" -> out.append(yes(list.removeEdge(u, v), "removed", "missing"))
            .append(' ').append(yes(matrix.removeEdge(u, v), "removed", "missing")).append('\n');
        case "neighbours" -> out.append(namesOf(list.neighbours(u), names))
            .append(" / ").append(namesOf(matrix.neighbours(u), names)).append('\n');
        default -> { }
      }
    }
    System.out.print(out);
  }

  private static String yes(boolean b, String a, String c) {
    return b ? a : c;
  }

  private static String namesOf(List<Integer> vs, List<String> names) {
    if (vs.isEmpty()) return "none";
    List<String> out = new ArrayList<>();
    for (int v : vs) out.add(names.get(v));
    return String.join(" ", out);
  }
}
