import java.util.NoSuchElementException;

/**
 * A min-max heap in an array indexed from 1 (slot 0 is not used). Even depths (the root's) are
 * min levels, odd depths are max levels.
 */
public class MinMaxHeap {
    private final int[] a;
    private int n = 0;

    public MinMaxHeap(int capacity) { a = new int[capacity + 1]; }

    public int size() { return n; }

    private static boolean onMinLevel(int i) {
        return (31 - Integer.numberOfLeadingZeros(i)) % 2 == 0;
    }

    /** x belongs nearer the top than y, on a min level (min) or a max level. */
    private static boolean better(boolean min, int x, int y) { return min ? x < y : x > y; }

    public void insert(int key) {
        if (n == a.length - 1) throw new IllegalStateException("heap overflow");
        a[++n] = key;
        pushUp(n);
    }

    public int extractMin() {
        if (n == 0) throw new NoSuchElementException("heap is empty");
        return remove(1);
    }

    public int extractMax() {
        if (n == 0) throw new NoSuchElementException("heap is empty");
        int m = 1;
        if (n >= 2) m = (n >= 3 && a[3] > a[2]) ? 3 : 2;
        return remove(m);
    }

    public void build(int[] keys) {
        if (keys.length > a.length - 1) throw new IllegalStateException("heap overflow");
        n = keys.length;
        System.arraycopy(keys, 0, a, 1, n);
        for (int i = n / 2; i >= 1; i--) trickleDown(i);
    }

    public void clear() { n = 0; }

    private int remove(int m) {
        int x = a[m];
        a[m] = a[n--];
        if (m <= n) trickleDown(m);
        return x;
    }

    private void swap(int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }

    private void pushUp(int i) {
        if (i == 1) return;
        int p = i / 2;
        boolean min = onMinLevel(i);
        if (better(!min, a[i], a[p])) {
            swap(i, p);
            pushUpSide(p, !min);
        } else {
            pushUpSide(i, min);
        }
    }

    private void pushUpSide(int i, boolean min) {
        while (i >= 4 && better(min, a[i], a[i / 4])) {
            swap(i, i / 4);
            i /= 4;
        }
    }

    private void trickleDown(int i) {
        boolean min = onMinLevel(i);
        while (2 * i <= n) {
            int m = 2 * i;
            int[] below = {2 * i + 1, 4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3};
            for (int c : below)
                if (c <= n && better(min, a[c], a[m])) m = c;
            if (!better(min, a[m], a[i])) return;
            swap(i, m);
            if (m <= 2 * i + 1) return;
            if (better(min, a[m / 2], a[m])) swap(m, m / 2);
            i = m;
        }
    }
}
