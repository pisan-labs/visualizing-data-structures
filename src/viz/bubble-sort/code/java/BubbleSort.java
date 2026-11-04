/**
 * Bubble sort, smallest first. Each pass walks j from the back to the front and swaps
 * neighbors that are out of order, so after pass i the i + 1 smallest values are in a[0..i].
 */
public class BubbleSort {
    public static void sort(int[] a) {
        int n = a.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = n - 1; j > i; j--) {
                if (a[j] < a[j - 1]) {
                    int t = a[j];
                    a[j] = a[j - 1];
                    a[j - 1] = t;
                }
            }
        }
    }
}
