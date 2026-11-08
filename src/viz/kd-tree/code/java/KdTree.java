import java.util.ArrayList;
import java.util.List;

/** A 2-d tree: nodes split on x at even depths and on y at odd depths. */
public class KdTree {
  public record Point(int x, int y) {
    int get(int axis) {
      return axis == 0 ? x : y;
    }
  }

  private static final class Node {
    final Point p;
    final int depth;
    Node left, right;

    Node(Point p, int depth) {
      this.p = p;
      this.depth = depth;
    }
  }

  private Node root;
  private Point best;
  private long bestD2;

  public void insert(Point p) {
    if (root == null) {
      root = new Node(p, 0);
      return;
    }
    Node x = root;
    while (!x.p.equals(p)) { // a point already in the tree is skipped
      int a = x.depth % 2;
      if (p.get(a) < x.p.get(a)) {
        if (x.left == null) {
          x.left = new Node(p, x.depth + 1);
          return;
        }
        x = x.left;
      } else {
        if (x.right == null) {
          x.right = new Node(p, x.depth + 1);
          return;
        }
        x = x.right;
      }
    }
  }

  static long dist2(Point a, Point b) {
    long dx = a.x() - b.x(), dy = a.y() - b.y();
    return dx * dx + dy * dy;
  }

  /** The point nearest q, or null if the tree is empty; bestDistance2() is its distance². */
  public Point nearest(Point q) {
    best = null;
    bestD2 = Long.MAX_VALUE;
    nearest(root, q);
    return best;
  }

  public long bestDistance2() {
    return bestD2;
  }

  private void nearest(Node x, Point q) {
    if (x == null) return;
    long d = dist2(q, x.p);
    if (d < bestD2) {
      best = x.p;
      bestD2 = d;
    }
    int a = x.depth % 2;
    long diff = q.get(a) - x.p.get(a);
    Node near = diff < 0 ? x.left : x.right;
    Node far = diff < 0 ? x.right : x.left;
    nearest(near, q);
    if (diff * diff < bestD2) nearest(far, q); // the best circle crosses the line
  }

  /** Every point with lo <= p <= hi on both coordinates. */
  public List<Point> range(Point lo, Point hi) {
    List<Point> out = new ArrayList<>();
    range(root, lo, hi, out);
    return out;
  }

  private void range(Node x, Point lo, Point hi, List<Point> out) {
    if (x == null) return;
    Point p = x.p;
    if (lo.x() <= p.x() && p.x() <= hi.x() && lo.y() <= p.y() && p.y() <= hi.y()) out.add(p);
    int a = x.depth % 2;
    if (lo.get(a) < p.get(a)) range(x.left, lo, hi, out);
    if (hi.get(a) >= p.get(a)) range(x.right, lo, hi, out);
  }
}
