/**
 * Heap sort, smallest first. Java arrays start at 0, so this is the page's "from 0" indexing:
 * the children of a[i] are a[2i + 1] and a[2i + 2]. a[0..size-1] is the heap and the rest is
 * the sorted part.
 */
public class HeapSort {
    public static void sort(int[] a) {
        int n = a.length;
        // Phase 1: build a max-heap, from the last node with a child back to the root.
        for (int i = n / 2 - 1; i >= 0; i--) {
            maxHeapify(a, i, n);
        }
        // Phase 2: move the largest value to the end, shrink the heap, fix the root.
        for (int last = n - 1; last > 0; last--) {
            swap(a, 0, last);
            maxHeapify(a, 0, last);
        }
    }

    /** Sift a[i] down the heap a[0..size-1] until neither child is bigger. */
    static void maxHeapify(int[] a, int i, int size) {
        while (true) {
            int left = 2 * i + 1;
            int right = 2 * i + 2;
            int largest = i;
            if (left < size && a[left] > a[largest]) {
                largest = left;
            }
            if (right < size && a[right] > a[largest]) {
                largest = right;
            }
            if (largest == i) {
                return;
            }
            swap(a, i, largest);
            i = largest;
        }
    }

    private static void swap(int[] a, int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
}
