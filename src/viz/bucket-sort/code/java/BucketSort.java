import java.util.ArrayList;
import java.util.List;

/** Bucket sort: n buckets of equal width, insertion sort in each, then join them. */
public class BucketSort {
    /** Sorts values in [lo, hi). */
    public static void sort(double[] a, double lo, double hi) {
        int n = a.length;
        List<List<Double>> buckets = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            buckets.add(new ArrayList<>());
        }
        for (double x : a) {
            buckets.get(Math.min(n - 1, (int) (n * (x - lo) / (hi - lo)))).add(x);
        }
        int k = 0;
        for (List<Double> bucket : buckets) {
            insertionSort(bucket);
            for (double x : bucket) {
                a[k++] = x;
            }
        }
    }

    static void insertionSort(List<Double> b) {
        for (int i = 1; i < b.size(); i++) {
            double key = b.get(i);
            int j = i - 1;
            while (j >= 0 && b.get(j) > key) {
                b.set(j + 1, b.get(j));
                j--;
            }
            b.set(j + 1, key);
        }
    }
}
