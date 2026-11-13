import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.PriorityQueue;
import java.util.Random;
import java.util.Set;

/**
 * Hierarchical navigable small world graph (Malkov and Yashunin 2018). A pair {distance, id}
 * orders by distance, then by id (the point inserted first).
 */
public class Hnsw {
    static final Comparator<int[]> NEAR =
            (a, b) -> a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]);

    final int m, efConstruction;
    final List<int[]> points = new ArrayList<>(); // {x, y} by id
    final List<List<List<Integer>>> links = new ArrayList<>(); // links[id][layer]
    Integer entry = null;
    int distances = 0; // computed by the last insert or search
    final Random random = new Random();

    public Hnsw(int m, int efConstruction) {
        this.m = m;
        this.efConstruction = efConstruction;
    }

    static int dist2(int[] a, int[] b) {
        int dx = a[0] - b[0], dy = a[1] - b[1];
        return dx * dx + dy * dy;
    }

    /** Like a skip list: layer l is reached with chance m^-l. */
    int randomLevel() {
        return (int) (-Math.log(1.0 - random.nextDouble()) / Math.log(m));
    }

    int dist(int[] q, int i) {
        distances++;
        return dist2(q, points.get(i));
    }

    /** Best-first search of one layer. Returns the ef nearest found, nearest first. */
    List<int[]> searchLayer(int[] q, List<int[]> entryPoints, int ef, int layer) {
        Set<Integer> visited = new HashSet<>();
        PriorityQueue<int[]> candidates = new PriorityQueue<>(NEAR);
        PriorityQueue<int[]> found = new PriorityQueue<>(NEAR.reversed()); // farthest on top
        for (int[] p : entryPoints) {
            visited.add(p[1]);
            candidates.add(p);
            found.add(p);
        }
        while (!candidates.isEmpty()) {
            int[] c = candidates.poll();
            if (NEAR.compare(c, found.peek()) > 0) break; // farther than everything kept
            for (int e : links.get(c[1]).get(layer)) {
                if (!visited.add(e)) continue;
                int[] pe = {dist(q, e), e};
                if (found.size() < ef || NEAR.compare(pe, found.peek()) < 0) {
                    candidates.add(pe);
                    found.add(pe);
                    if (found.size() > ef) found.poll();
                }
            }
        }
        List<int[]> out = new ArrayList<>(found);
        out.sort(NEAR);
        return out;
    }

    /** Add point q at the given level; returns its id. */
    public int insert(int[] q, int level) {
        int id = points.size();
        points.add(q);
        List<List<Integer>> own = new ArrayList<>();
        for (int l = 0; l <= level; l++) own.add(new ArrayList<>());
        links.add(own);
        distances = 0;
        if (entry == null) {
            entry = id;
            return id;
        }
        int top = links.get(entry).size() - 1;
        List<int[]> eps = List.of(new int[] {dist(q, entry), entry});
        for (int layer = top; layer > level; layer--) // greedy: ef = 1
            eps = searchLayer(q, eps, 1, layer).subList(0, 1);
        for (int layer = Math.min(top, level); layer >= 0; layer--) {
            List<int[]> found = searchLayer(q, eps, efConstruction, layer);
            int limit = layer == 0 ? 2 * m : m;
            for (int[] f : found.subList(0, Math.min(m, found.size()))) own.get(layer).add(f[1]);
            for (int e : own.get(layer)) {
                List<Integer> theirs = links.get(e).get(layer);
                theirs.add(id);
                if (theirs.size() > limit) { // keep the nearest
                    int[] p = points.get(e);
                    theirs.sort(Comparator.comparingInt((Integer j) -> dist2(p, points.get(j))).thenComparingInt(j -> j));
                    theirs.subList(limit, theirs.size()).clear();
                }
            }
            eps = found;
        }
        if (level > top) entry = id;
        return id;
    }

    /** The k nearest ids found (approximate). */
    public List<Integer> search(int[] q, int k, int ef) {
        distances = 0;
        int top = links.get(entry).size() - 1;
        List<int[]> eps = List.of(new int[] {dist(q, entry), entry});
        for (int layer = top; layer > 0; layer--) eps = searchLayer(q, eps, 1, layer).subList(0, 1);
        List<Integer> out = new ArrayList<>();
        for (int[] f : searchLayer(q, eps, ef, 0)) if (out.size() < k) out.add(f[1]);
        return out;
    }
}
