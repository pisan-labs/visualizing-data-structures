import java.util.NoSuchElementException;

/**
 * A max-heap in a fixed-size array, indexed from 1 as in CLRS: slot 0 is not used.
 * parent(i) = i / 2, left(i) = 2i, right(i) = 2i + 1.
 */
public class MaxHeap {
    private final int[] a;
    private int n = 0;

    public MaxHeap(int capacity) {
        a = new int[capacity + 1];
    }

    public int size() {
        return n;
    }

    public void insert(int key) {
        if (n == a.length - 1) {
            throw new IllegalStateException("heap overflow");
        }
        n = n + 1;
        a[n] = key;
        siftUp(n);
    }

    public int maximum() {
        if (n == 0) {
            throw new NoSuchElementException("heap is empty");
        }
        return a[1];
    }

    public int extractMax() {
        if (n == 0) {
            throw new NoSuchElementException("heap underflow");
        }
        int max = a[1];
        a[1] = a[n];
        n = n - 1;
        maxHeapify(1);
        return max;
    }

    /** Bottom-up: copy the keys in, then sift down from the last parent to the root. */
    public void build(int[] keys) {
        if (keys.length > a.length - 1) {
            throw new IllegalStateException("heap overflow");
        }
        n = keys.length;
        System.arraycopy(keys, 0, a, 1, n);
        for (int i = n / 2; i >= 1; i--) {
            maxHeapify(i);
        }
    }

    public void updateKey(int i, int key) {
        if (i < 1 || i > n) {
            throw new IndexOutOfBoundsException("no such slot");
        }
        int old = a[i];
        a[i] = key;
        if (key > old) {
            siftUp(i);
        } else if (key < old) {
            maxHeapify(i);
        }
    }

    public int delete(int i) {
        if (i < 1 || i > n) {
            throw new IndexOutOfBoundsException("no such slot");
        }
        int old = a[i];
        int last = a[n];
        n = n - 1;
        if (i <= n) {
            a[i] = last;
            if (last > old) {
                siftUp(i);
            } else if (last < old) {
                maxHeapify(i);
            }
        }
        return old;
    }

    public void clear() {
        n = 0;
    }

    private void siftUp(int i) {
        while (i > 1 && a[i / 2] < a[i]) {
            swap(i, i / 2);
            i = i / 2;
        }
    }

    private void maxHeapify(int i) {
        int left = 2 * i;
        int right = 2 * i + 1;
        int largest = (left <= n && a[left] > a[i]) ? left : i;
        if (right <= n && a[right] > a[largest]) {
            largest = right;
        }
        if (largest != i) {
            swap(i, largest);
            maxHeapify(largest);
        }
    }

    private void swap(int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
}
