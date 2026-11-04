import java.util.ArrayList;
import java.util.List;

/** LSD radix sort of whole numbers >= 0: one stable pass per digit, last digit first. */
public class RadixSort {
    public static void sort(int[] a, int base) {
        if (a.length == 0) {
            return;
        }
        int largest = 0;
        for (int x : a) {
            largest = Math.max(largest, x);
        }
        for (long place = 1; ; place *= base) {
            List<List<Integer>> buckets = new ArrayList<>();
            for (int d = 0; d < base; d++) {
                buckets.add(new ArrayList<>());
            }
            for (int x : a) { // left to right, to the back of each bucket: stable
                buckets.get((int) (x / place % base)).add(x);
            }
            int k = 0;
            for (List<Integer> bucket : buckets) {
                for (int x : bucket) {
                    a[k++] = x;
                }
            }
            if (largest < place * base) {
                return;
            }
        }
    }

    public static void sort(int[] a) {
        sort(a, 10);
    }
}
