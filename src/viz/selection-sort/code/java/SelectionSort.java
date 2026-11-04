/**
 * Selection sort, smallest first. Pass i finds the smallest value in a[i..n-1] and swaps it
 * into a[i], so after pass i the i + 1 smallest values are in their final places.
 */
public class SelectionSort {
    public static void sort(int[] a) {
        int n = a.length;
        for (int i = 0; i < n - 1; i++) {
            int smallest = i;
            for (int j = i + 1; j < n; j++) {
                if (a[j] < a[smallest]) {
                    smallest = j;
                }
            }
            int t = a[i];
            a[i] = a[smallest];
            a[smallest] = t;
        }
    }
}
