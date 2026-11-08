import java.util.ArrayList;
import java.util.List;

/** CLRS ANY-SEGMENTS-INTERSECT: a sweep line over segments with no vertical ones. */
public class Segments {
  /** A segment from (x1, y1) to (x2, y2) with x1 < x2. */
  public record Seg(long x1, long y1, long x2, long y2) {}

  static long turn(long ax, long ay, long bx, long by, long cx, long cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  static boolean onSegment(long rx, long ry, long ax, long ay, long bx, long by) {
    return Math.min(ax, bx) <= rx && rx <= Math.max(ax, bx)
        && Math.min(ay, by) <= ry && ry <= Math.max(ay, by);
  }

  /** CLRS SEGMENTS-INTERSECT: do s and t share a point? */
  static boolean intersects(Seg s, Seg t) {
    long d1 = turn(t.x1(), t.y1(), t.x2(), t.y2(), s.x1(), s.y1());
    long d2 = turn(t.x1(), t.y1(), t.x2(), t.y2(), s.x2(), s.y2());
    long d3 = turn(s.x1(), s.y1(), s.x2(), s.y2(), t.x1(), t.y1());
    long d4 = turn(s.x1(), s.y1(), s.x2(), s.y2(), t.x2(), t.y2());
    if (Long.signum(d1) * Long.signum(d2) < 0 && Long.signum(d3) * Long.signum(d4) < 0) return true;
    return (d1 == 0 && onSegment(s.x1(), s.y1(), t.x1(), t.y1(), t.x2(), t.y2()))
        || (d2 == 0 && onSegment(s.x2(), s.y2(), t.x1(), t.y1(), t.x2(), t.y2()))
        || (d3 == 0 && onSegment(t.x1(), t.y1(), s.x1(), s.y1(), s.x2(), s.y2()))
        || (d4 == 0 && onSegment(t.x2(), t.y2(), s.x1(), s.y1(), s.x2(), s.y2()));
  }

  /** Is s below t on the sweep line at x? Ties: the smaller slope is lower just to the right. */
  static boolean below(Seg s, Seg t, long x) {
    long ys = s.y1() * (s.x2() - s.x1()) + (x - s.x1()) * (s.y2() - s.y1());
    long yt = t.y1() * (t.x2() - t.x1()) + (x - t.x1()) * (t.y2() - t.y1());
    long lhs = ys * (t.x2() - t.x1()), rhs = yt * (s.x2() - s.x1());
    if (lhs != rhs) return lhs < rhs;
    return (s.y2() - s.y1()) * (t.x2() - t.x1()) < (t.y2() - t.y1()) * (s.x2() - s.x1());
  }

  public static boolean anySegmentsIntersect(List<Seg> segs) {
    // {x, kind (0 = left end, 1 = right end), y, index}
    List<long[]> events = new ArrayList<>();
    for (int i = 0; i < segs.size(); i++) {
      Seg s = segs.get(i);
      events.add(new long[] {s.x1(), 0, s.y1(), i});
      events.add(new long[] {s.x2(), 1, s.y2(), i});
    }
    events.sort(
        (a, b) -> {
          for (int k = 0; k < 4; k++) if (a[k] != b[k]) return Long.compare(a[k], b[k]);
          return 0;
        });
    List<Integer> status = new ArrayList<>(); // bottom to top
    for (long[] e : events) {
      int i = (int) e[3];
      Seg s = segs.get(i);
      if (e[1] == 0) {
        int k = 0;
        while (k < status.size() && below(segs.get(status.get(k)), s, e[0])) k++;
        status.add(k, i);
        if (k > 0 && intersects(s, segs.get(status.get(k - 1)))) return true;
        if (k + 1 < status.size() && intersects(s, segs.get(status.get(k + 1)))) return true;
      } else {
        int k = status.indexOf(i);
        if (k > 0 && k + 1 < status.size()
            && intersects(segs.get(status.get(k - 1)), segs.get(status.get(k + 1)))) return true;
        status.remove(k);
      }
    }
    return false;
  }
}
