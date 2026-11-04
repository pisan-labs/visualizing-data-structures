/**
 * Cocktail shaker sort, smallest first. Passes alternate direction: a forward pass carries
 * the largest value in a[lo..hi] to a[hi], a backward pass carries the smallest to a[lo].
 * A pass with no swaps means the array is sorted.
 */
public class CocktailSort {
    public static void sort(int[] a) {
        int lo = 0;
        int hi = a.length - 1;
        while (lo < hi) {
            boolean swapped = false;
            for (int j = lo; j < hi; j++) {
                if (a[j] > a[j + 1]) {
                    swap(a, j, j + 1);
                    swapped = true;
                }
            }
            hi--;
            if (!swapped) {
                return;
            }
            swapped = false;
            for (int j = hi; j > lo; j--) {
                if (a[j] < a[j - 1]) {
                    swap(a, j, j - 1);
                    swapped = true;
                }
            }
            lo++;
            if (!swapped) {
                return;
            }
        }
    }

    private static void swap(int[] a, int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
}
