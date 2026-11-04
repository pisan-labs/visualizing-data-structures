import java.util.Arrays;

/** Merge sort, smallest first: sort each half, then merge the two sorted halves. */
public class MergeSort {
    public static void sort(int[] a) {
        sort(a, 0, a.length - 1);
    }

    static void sort(int[] a, int p, int r) {
        if (p >= r) {
            return;
        }
        int q = (p + r) / 2;
        sort(a, p, q);
        sort(a, q + 1, r);
        merge(a, p, q, r);
    }

    /** Merges the sorted runs a[p..q] and a[q+1..r] into a[p..r]. */
    static void merge(int[] a, int p, int q, int r) {
        int[] left = Arrays.copyOfRange(a, p, q + 1);
        int[] right = Arrays.copyOfRange(a, q + 1, r + 1);
        int i = 0;
        int j = 0;
        int k = p;
        while (i < left.length && j < right.length) {
            if (left[i] <= right[j]) {
                a[k++] = left[i++];
            } else {
                a[k++] = right[j++];
            }
        }
        while (i < left.length) {
            a[k++] = left[i++];
        }
        while (j < right.length) {
            a[k++] = right[j++];
        }
    }
}
