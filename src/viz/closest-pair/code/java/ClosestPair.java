import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/** Closest pair of points by divide and conquer, O(n lg n). */
public class ClosestPair {
  public record Point(int x, int y) {}

  static long dist2(Point p, Point q) {
    long dx = p.x() - q.x(), dy = p.y() - q.y();
    return dx * dx + dy * dy;
  }

  /** The smallest squared distance between two of the points (at least two). */
  public static long closest(List<Point> points) {
    Point[] px = points.toArray(new Point[0]);
    Point[] py = px.clone();
    Arrays.sort(px, Comparator.comparingInt(Point::x).thenComparingInt(Point::y));
    Arrays.sort(py, Comparator.comparingInt(Point::y).thenComparingInt(Point::x));
    return closest(List.of(px), List.of(py));
  }

  private static long closest(List<Point> px, List<Point> py) {
    int n = px.size();
    long d = Long.MAX_VALUE;
    if (n <= 3) { // brute force the base case
      for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++) d = Math.min(d, dist2(px.get(i), px.get(j)));
      return d;
    }
    int mid = n / 2;
    int xm = px.get(mid).x(); // the dividing line x = xm
    List<Point> left = px.subList(0, mid), right = px.subList(mid, n);
    // Split py the same way. Equal points are interchangeable, so count them off.
    List<Point> yl = new ArrayList<>(), yr = new ArrayList<>();
    List<Point> pool = new ArrayList<>(left);
    for (Point p : py) {
      if (pool.remove(p)) yl.add(p);
      else yr.add(p);
    }
    d = Math.min(closest(left, yl), closest(right, yr));
    List<Point> strip = new ArrayList<>(); // within delta of the line, by y
    for (Point p : py) if ((long) (p.x() - xm) * (p.x() - xm) < d) strip.add(p);
    for (int i = 0; i < strip.size(); i++) {
      for (int j = i + 1; j < strip.size(); j++) {
        long dy = strip.get(j).y() - strip.get(i).y();
        if (dy * dy >= d) break; // at most 7 points get this far
        d = Math.min(d, dist2(strip.get(i), strip.get(j)));
      }
    }
    return d;
  }
}
