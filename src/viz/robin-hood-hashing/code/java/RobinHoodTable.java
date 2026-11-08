import java.util.Arrays;

/**
 * Linear probing with h(k) = k mod m, where a key further from home takes the slot of a key
 * closer to home. Deletion shifts the keys behind back, so there are no tombstones.
 */
public class RobinHoodTable {
    private static final int EMPTY = -1;

    private final int m;
    private final int[] t;
    private int n;
    private int probes; // slots looked at by the last operation

    public RobinHoodTable(int m) {
        this.m = m;
        this.t = new int[m];
        Arrays.fill(t, EMPTY);
    }

    public int size() { return m; }
    public int probes() { return probes; }
    public int at(int j) { return t[j]; }

    /** How far slot j is from k's home slot: its probe distance. */
    private int dist(int k, int j) {
        return Math.floorMod(j - k % m, m);
    }

    /** Returns the number of swaps, or -1 if k is already there; throws if the table is full. */
    public int insert(int k) {
        if (n == m && search(k) < 0) throw new IllegalStateException("table full");
        int x = k, j = k % m, d = 0, swaps = 0;
        for (int i = 0; i < m; i++) {
            probes = i + 1;
            if (t[j] == EMPTY) {
                t[j] = x;
                n++;
                return swaps;
            }
            if (swaps == 0 && t[j] == k) return -1;
            if (dist(t[j], j) < d) { // take from the rich
                int y = t[j];
                t[j] = x;
                x = y;
                d = dist(x, j);
                swaps++;
            }
            j = (j + 1) % m;
            d++;
        }
        throw new IllegalStateException("table full");
    }

    /** The slot of k, or -1. Stops early at a key closer to home than k would be. */
    public int search(int k) {
        int j = k % m;
        for (int d = 0; d < m; d++) {
            probes = d + 1;
            if (t[j] == EMPTY) return -1;
            if (t[j] == k) return j;
            if (dist(t[j], j) < d) return -1;
            j = (j + 1) % m;
        }
        return -1;
    }

    /** Returns the number of keys shifted back, or -1 if k is not there. */
    public int delete(int k) {
        int j = search(k);
        if (j < 0) return -1;
        t[j] = EMPTY;
        n--;
        int shifts = 0;
        int next = (j + 1) % m;
        while (t[next] != EMPTY && dist(t[next], next) > 0) {
            t[j] = t[next];
            t[next] = EMPTY;
            j = next;
            next = (next + 1) % m;
            shifts++;
        }
        return shifts;
    }
}
