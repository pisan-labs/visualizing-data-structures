/**
 * Introsort: quicksort with a depth budget of 2 * floor(log2 n). Heap sort takes over a part
 * when the budget runs out, and insertion sort finishes small parts.
 */
public final class Introsort {
    private static final int SMALL = 3; // libraries use 16

    private Introsort() { }

    public static void sort(int[] a) {
        if (a.length > 1) {
            loop(a, 0, a.length - 1, 2 * (31 - Integer.numberOfLeadingZeros(a.length)));
        }
    }

    private static void loop(int[] a, int p, int r, int limit) {
        if (r - p + 1 <= SMALL) {
            insertionSort(a, p, r);
        } else if (limit == 0) {
            heapSort(a, p, r);
        } else {
            int q = partition(a, p, r);
            loop(a, p, q - 1, limit - 1);
            loop(a, q + 1, r, limit - 1);
        }
    }

    /** Lomuto's partition around the median of a[p], a[mid] and a[r]. */
    private static int partition(int[] a, int p, int r) {
        int mid = (p + r) / 2;
        int m = median(a, p, mid, r);
        swap(a, m, r);
        int x = a[r];
        int i = p - 1;
        for (int j = p; j < r; j++) {
            if (a[j] <= x) {
                swap(a, ++i, j);
            }
        }
        swap(a, i + 1, r);
        return i + 1;
    }

    /** The index holding the middle value of a[i], a[j], a[k] (i < j < k; ties keep that order). */
    private static int median(int[] a, int i, int j, int k) {
        int[] idx = {i, j, k};
        for (int s = 1; s < 3; s++) {
            for (int t = s; t > 0 && a[idx[t - 1]] > a[idx[t]]; t--) {
                int tmp = idx[t];
                idx[t] = idx[t - 1];
                idx[t - 1] = tmp;
            }
        }
        return idx[1];
    }

    private static void insertionSort(int[] a, int p, int r) {
        for (int i = p + 1; i <= r; i++) {
            for (int j = i; j > p && a[j - 1] > a[j]; j--) {
                swap(a, j - 1, j);
            }
        }
    }

    private static void heapSort(int[] a, int p, int r) {
        int n = r - p + 1;
        for (int i = n / 2 - 1; i >= 0; i--) {
            siftDown(a, p, i, n);
        }
        for (int end = n - 1; end > 0; end--) {
            swap(a, p, p + end);
            siftDown(a, p, 0, end);
        }
    }

    private static void siftDown(int[] a, int p, int i, int size) {
        while (2 * i + 1 < size) {
            int big = 2 * i + 1;
            if (big + 1 < size && a[p + big + 1] > a[p + big]) {
                big++;
            }
            if (a[p + big] <= a[p + i]) {
                return;
            }
            swap(a, p + i, p + big);
            i = big;
        }
    }

    private static void swap(int[] a, int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
}
