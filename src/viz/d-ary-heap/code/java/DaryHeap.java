import java.util.NoSuchElementException;

/**
 * A max-heap with d children per node, in an array indexed from 1 (slot 0 is not used).
 * parent(i) = (i - 2) / d + 1, child(i, j) = d * (i - 1) + j + 1 for j = 1..d.
 */
public class DaryHeap {
    private final int d;
    private final int[] a;
    private int n = 0;

    public DaryHeap(int d, int capacity) {
        this.d = d;
        this.a = new int[capacity + 1];
    }

    public int size() { return n; }

    private int parent(int i) { return Math.floorDiv(i - 2, d) + 1; }

    private int child(int i, int j) { return d * (i - 1) + j + 1; }

    public void insert(int key) {
        if (n == a.length - 1) throw new IllegalStateException("heap overflow");
        a[++n] = key;
        siftUp(n);
    }

    public int extractMax() {
        if (n == 0) throw new NoSuchElementException("heap underflow");
        int top = a[1];
        a[1] = a[n--];
        siftDown(1);
        return top;
    }

    public void build(int[] keys) {
        if (keys.length > a.length - 1) throw new IllegalStateException("heap overflow");
        n = keys.length;
        System.arraycopy(keys, 0, a, 1, n);
        if (n > 1) for (int i = parent(n); i >= 1; i--) siftDown(i);
    }

    public void updateKey(int i, int key) {
        if (i < 1 || i > n) throw new IndexOutOfBoundsException("no such slot");
        int old = a[i];
        a[i] = key;
        if (key > old) siftUp(i);
        else if (key < old) siftDown(i);
    }

    public void clear() { n = 0; }

    private void swap(int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }

    private void siftUp(int i) {
        while (i > 1 && a[i] > a[parent(i)]) {
            swap(i, parent(i));
            i = parent(i);
        }
    }

    private void siftDown(int i) {
        while (true) {
            int largest = i;
            for (int j = 1; j <= d; j++) {
                int c = child(i, j);
                if (c <= n && a[c] > a[largest]) largest = c;
            }
            if (largest == i) return;
            swap(i, largest);
            i = largest;
        }
    }
}
