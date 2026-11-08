import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Comparator;
import java.util.List;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    int capacity = 1;
    QuadTree tree = new QuadTree(capacity, 16);
    String line;
    while ((line = in.readLine()) != null) {
      String[] t = line.trim().split("\\s+");
      if (t[0].isEmpty()) continue;
      int[] n = new int[t.length - 1];
      for (int i = 1; i < t.length; i++) n[i - 1] = Integer.parseInt(t[i]);
      switch (t[0]) {
        case "capacity" -> {
          capacity = n[0];
          tree = new QuadTree(capacity, 16);
        }
        case "clear" -> tree = new QuadTree(capacity, 16);
        case "insert" -> tree.insert(new QuadTree.Point(n[0], n[1]));
        case "query" -> {
          List<QuadTree.Point> pts =
              tree.query(new QuadTree.Point(n[0], n[1]), new QuadTree.Point(n[2], n[3]));
          pts.sort(
              Comparator.comparingInt(QuadTree.Point::x).thenComparingInt(QuadTree.Point::y));
          StringJoiner row = new StringJoiner(" ");
          for (QuadTree.Point p : pts) row.add(p.x() + "," + p.y());
          out.append(pts.isEmpty() ? "none" : row.toString()).append('\n');
        }
        case "stats" -> {
          int[] s = tree.stats();
          out.append("nodes=").append(s[0]).append(" height=").append(s[1]).append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
