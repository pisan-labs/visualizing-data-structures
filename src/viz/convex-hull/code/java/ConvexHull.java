import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

public class ConvexHull {
  public record Point(int x, int y) {}

  /** Positive if a -> b -> c turns left, negative if right, 0 if collinear. */
  static long turn(Point a, Point b, Point c) {
    return (long) (b.x() - a.x()) * (c.y() - a.y()) - (long) (b.y() - a.y()) * (c.x() - a.x());
  }

  static long dist2(Point a, Point b) {
    long dx = a.x() - b.x(), dy = a.y() - b.y();
    return dx * dx + dy * dy;
  }

  /** Corners of the convex hull, counter-clockwise from the lowest point. */
  public static List<Point> grahamScan(List<Point> points) {
    List<Point> pts = new ArrayList<>(new LinkedHashSet<>(points)); // drop duplicates
    List<Point> stack = new ArrayList<>();
    if (pts.isEmpty()) return stack;
    Point p0 = pts.get(0);
    for (Point p : pts) {
      if (p.y() < p0.y() || (p.y() == p0.y() && p.x() < p0.x())) p0 = p;
    }
    final Point o = p0;
    pts.remove(o);
    pts.sort((a, b) -> {
      long t = turn(o, a, b);
      return t != 0 ? (t > 0 ? -1 : 1) : Long.compare(dist2(o, a), dist2(o, b));
    });
    pts.add(0, o);
    for (Point p : pts) {
      // Pop every point that does not make a left turn on the way to p.
      while (stack.size() >= 2
          && turn(stack.get(stack.size() - 2), stack.get(stack.size() - 1), p) <= 0) {
        stack.remove(stack.size() - 1);
      }
      stack.add(p);
    }
    return stack;
  }
}
