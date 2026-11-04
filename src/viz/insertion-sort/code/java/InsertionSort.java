/**
 * Insertion sort, smallest first. a[0..i-1] is always sorted. Take key = a[i], shift the
 * larger values in the sorted part one slot right, and drop key into the gap.
 */
public class InsertionSort {
    public static void sort(int[] a) {
        for (int i = 1; i < a.length; i++) {
            int key = a[i];
            int j = i - 1;
            while (j >= 0 && a[j] > key) {
                a[j + 1] = a[j];
                j--;
            }
            a[j + 1] = key;
        }
    }
}
