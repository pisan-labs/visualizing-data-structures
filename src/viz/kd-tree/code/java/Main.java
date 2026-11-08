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
    KdTree tree = new KdTree();
    String line;
    while ((line = in.readLine()) != null) {
      String[] t = line.trim().split("\\s+");
      if (t[0].isEmpty()) continue;
      int[] n = new int[t.length - 1];
      for (int i = 1; i < t.length; i++) n[i - 1] = Integer.parseInt(t[i]);
      switch (t[0]) {
        case "insert" -> tree.insert(new KdTree.Point(n[0], n[1]));
        case "clear" -> tree = new KdTree();
        case "nearest" -> {
          KdTree.Point p = tree.nearest(new KdTree.Point(n[0], n[1]));
          out.append(p == null ? "empty" : p.x() + "," + p.y() + " " + tree.bestDistance2());
          out.append('\n');
        }
        case "range" -> {
          List<KdTree.Point> pts =
              tree.range(new KdTree.Point(n[0], n[1]), new KdTree.Point(n[2], n[3]));
          pts.sort(Comparator.comparingInt(KdTree.Point::x).thenComparingInt(KdTree.Point::y));
          StringJoiner row = new StringJoiner(" ");
          for (KdTree.Point p : pts) row.add(p.x() + "," + p.y());
          out.append(pts.isEmpty() ? "none" : row.toString()).append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
