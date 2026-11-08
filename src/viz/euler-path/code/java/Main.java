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
    List<int[]> edges = new ArrayList<>();
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
          edges = new ArrayList<>();
        }
        case "edge" -> edges.add(new int[] {index.get(p[1]), index.get(p[2])});
        case "euler" -> {
          List<Integer> path = Euler.eulerPath(names.size(), edges, directed);
          if (path == null) out.append("none\n");
          else {
            List<String> words = new ArrayList<>();
            for (int v : path) words.add(names.get(v));
            out.append(String.join(" ", words)).append('\n');
          }
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
