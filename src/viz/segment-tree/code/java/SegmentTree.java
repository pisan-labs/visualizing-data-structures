/**
 * Range sums, point updates and range adds with lazy propagation.
 * Node v covers A[lo..hi]; its children are 2v for A[lo..mid] and 2v + 1 for A[mid+1..hi].
 * lazy[v] is an add that node v still owes its children.
 */
public class SegmentTree {
    private final int n;
    private final long[] tree;
    private final long[] lazy;

    public SegmentTree(int[] values) {
        n = values.length;
        tree = new long[4 * n];
        lazy = new long[4 * n];
        build(1, 0, n - 1, values);
    }

    private void build(int v, int lo, int hi, int[] a) {
        if (lo == hi) {
            tree[v] = a[lo];
            return;
        }
        int mid = (lo + hi) / 2;
        build(2 * v, lo, mid, a);
        build(2 * v + 1, mid + 1, hi, a);
        tree[v] = tree[2 * v] + tree[2 * v + 1];
    }

    private void apply(int v, int lo, int hi, long x) {
        tree[v] += x * (hi - lo + 1);
        if (lo < hi) {
            lazy[v] += x;
        }
    }

    private void push(int v, int lo, int hi) {
        if (lazy[v] != 0) {
            int mid = (lo + hi) / 2;
            apply(2 * v, lo, mid, lazy[v]);
            apply(2 * v + 1, mid + 1, hi, lazy[v]);
            lazy[v] = 0;
        }
    }

    /** A[l] + ... + A[r]. O(log n). */
    public long query(int l, int r) {
        return query(1, 0, n - 1, l, r);
    }

    private long query(int v, int lo, int hi, int l, int r) {
        if (r < lo || hi < l) return 0; // no overlap
        if (l <= lo && hi <= r) return tree[v]; // full overlap
        push(v, lo, hi); // partial overlap
        int mid = (lo + hi) / 2;
        return query(2 * v, lo, mid, l, r) + query(2 * v + 1, mid + 1, hi, l, r);
    }

    /** Set A[i] to x. O(log n). */
    public void update(int i, long x) {
        update(1, 0, n - 1, i, x);
    }

    private void update(int v, int lo, int hi, int i, long x) {
        if (lo == hi) {
            tree[v] = x;
            return;
        }
        push(v, lo, hi);
        int mid = (lo + hi) / 2;
        if (i <= mid) update(2 * v, lo, mid, i, x);
        else update(2 * v + 1, mid + 1, hi, i, x);
        tree[v] = tree[2 * v] + tree[2 * v + 1];
    }

    /** Add x to every value in A[l..r]. O(log n), thanks to the lazy tags. */
    public void add(int l, int r, long x) {
        add(1, 0, n - 1, l, r, x);
    }

    private void add(int v, int lo, int hi, int l, int r, long x) {
        if (r < lo || hi < l) return;
        if (l <= lo && hi <= r) {
            apply(v, lo, hi, x);
            return;
        }
        push(v, lo, hi);
        int mid = (lo + hi) / 2;
        add(2 * v, lo, mid, l, r, x);
        add(2 * v + 1, mid + 1, hi, l, r, x);
        tree[v] = tree[2 * v] + tree[2 * v + 1];
    }
}
