import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;
import java.util.TreeSet;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    DisjointSets ds = new DisjointSets();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "clear" -> ds = new DisjointSets();
        case "makeset" -> ds.makeSet(Integer.parseInt(p[1]));
        case "find" -> out.append(ds.find(Integer.parseInt(p[1]))).append('\n');
        case "union" -> {
          int root = ds.union(Integer.parseInt(p[1]), Integer.parseInt(p[2]));
          out.append(root < 0 ? "same" : String.valueOf(root)).append('\n');
        }
        case "parents" -> {
          StringJoiner all = new StringJoiner(" ");
          for (int x : new TreeSet<>(ds.parent.keySet())) all.add(x + ":" + ds.parent.get(x));
          out.append(all).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
