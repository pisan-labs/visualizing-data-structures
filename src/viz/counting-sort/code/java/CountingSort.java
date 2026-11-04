/** Counting sort for whole numbers from 0 to k: count, add up, then place from the right. */
public class CountingSort {
    public static void sort(int[] a) {
        if (a.length == 0) {
            return;
        }
        int k = 0;
        for (int x : a) {
            k = Math.max(k, x);
        }
        int[] count = new int[k + 1];
        for (int x : a) {
            count[x]++;
        }
        for (int i = 1; i <= k; i++) {
            count[i] += count[i - 1]; // now count[i] is how many values are <= i
        }
        int[] out = new int[a.length];
        for (int j = a.length - 1; j >= 0; j--) { // from the right: stable
            count[a[j]]--;
            out[count[a[j]]] = a[j];
        }
        System.arraycopy(out, 0, a, 0, a.length);
    }
}
