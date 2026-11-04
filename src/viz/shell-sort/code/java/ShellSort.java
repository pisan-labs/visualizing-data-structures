/**
 * Shell sort, smallest first, with Shell's gaps n/2, n/4, ..., 1. For each gap h, insertion
 * sort every list of values h apart. The last gap is 1, a plain insertion sort on an array
 * that is nearly sorted.
 */
public class ShellSort {
    public static void sort(int[] a) {
        int n = a.length;
        for (int h = n / 2; h > 0; h /= 2) {
            for (int i = h; i < n; i++) {
                int temp = a[i];
                int j = i;
                while (j >= h && a[j - h] > temp) {
                    a[j] = a[j - h];
                    j -= h;
                }
                a[j] = temp;
            }
        }
    }
}
