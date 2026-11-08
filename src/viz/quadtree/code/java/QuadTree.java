import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** A point-region quadtree over [0, side)²; a leaf holds up to `capacity` points. */
public class QuadTree {
  public record Point(int x, int y) {}

  private static final class Node {
    final int x0, y0, size, depth;
    List<Point> points = new ArrayList<>();
    Node[] kids; // NW, NE, SW, SE once split

    Node(int x0, int y0, int size, int depth) {
      this.x0 = x0;
      this.y0 = y0;
      this.size = size;
      this.depth = depth;
    }

    int quadrant(Point p) {
      int h = size / 2;
      boolean east = p.x() >= x0 + h, north = p.y() >= y0 + h;
      return (north ? 0 : 2) + (east ? 1 : 0);
    }

    void split() {
      int h = size / 2;
      kids =
          new Node[] {
            new Node(x0, y0 + h, h, depth + 1),
            new Node(x0 + h, y0 + h, h, depth + 1),
            new Node(x0, y0, h, depth + 1),
            new Node(x0 + h, y0, h, depth + 1)
          };
      for (Point p : points) kids[quadrant(p)].points.add(p);
      points = null;
    }

    boolean meets(Point lo, Point hi) {
      return lo.x() < x0 + size && hi.x() >= x0 && lo.y() < y0 + size && hi.y() >= y0;
    }
  }

  private final int capacity;
  private final Node root;
  private final Set<Point> all = new HashSet<>();

  public QuadTree(int capacity, int side) {
    this.capacity = capacity;
    this.root = new Node(0, 0, side, 0);
  }

  public void insert(Point p) {
    if (!all.add(p)) return; // already there
    Node x = root;
    while (x.kids != null) x = x.kids[x.quadrant(p)];
    x.points.add(p);
    while (x.points.size() > capacity && x.size > 1) {
      x.split();
      x = x.kids[x.quadrant(p)];
    }
  }

  /** Every point with lo <= p <= hi on both coordinates. */
  public List<Point> query(Point lo, Point hi) {
    List<Point> out = new ArrayList<>();
    query(root, lo, hi, out);
    return out;
  }

  private void query(Node x, Point lo, Point hi, List<Point> out) {
    if (!x.meets(lo, hi)) return; // the square misses the rectangle
    if (x.kids != null) {
      for (Node k : x.kids) query(k, lo, hi, out);
      return;
    }
    for (Point p : x.points)
      if (lo.x() <= p.x() && p.x() <= hi.x() && lo.y() <= p.y() && p.y() <= hi.y()) out.add(p);
  }

  /** {number of nodes, height}. */
  public int[] stats() {
    return stats(root);
  }

  private int[] stats(Node x) {
    if (x.kids == null) return new int[] {1, x.depth};
    int[] r = {1, 0};
    for (Node k : x.kids) {
      int[] s = stats(k);
      r[0] += s[0];
      r[1] = Math.max(r[1], s[1]);
    }
    return r;
  }
}
