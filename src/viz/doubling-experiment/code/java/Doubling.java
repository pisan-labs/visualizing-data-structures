import java.util.ArrayList;
import java.util.List;
import java.util.function.IntFunction;
import java.util.function.ToLongFunction;

/**
 * A doubling experiment: count an algorithm's basic steps at n, 2n, 4n, ... Each algorithm
 * returns how many basic steps it took. doubling() runs one at sizes that double and estimates
 * b in T(n) ~ a * n^b from each ratio, since T(2n) / T(n) ~ 2^b.
 */
public class Doubling {
    /** Bigger than every input value, so searches never find it. */
    static final int MISSING = 1_000_000;

    static long linearSearch(int[] a) {
        long steps = 0;
        for (int v : a) {
            steps++; // one comparison
            if (v == MISSING) break;
        }
        return steps;
    }

    /** a is sorted. */
    static long binarySearch(int[] a) {
        long steps = 0;
        int lo = 0, hi = a.length - 1;
        while (lo <= hi) {
            int mid = (lo + hi) / 2;
            steps++; // one probe
            if (a[mid] == MISSING) break;
            if (a[mid] < MISSING) lo = mid + 1;
            else hi = mid - 1;
        }
        return steps;
    }

    /** Put a's values in a hash set (linear probing): count slots looked at. */
    static long distinctValues(int[] a) {
        int bits = 1;
        while ((1 << bits) < 2 * a.length) bits++;
        int size = 1 << bits;
        boolean[] used = new boolean[size];
        int[] keys = new int[size];
        long steps = 0;
        for (int x : a) {
            int i = (int) (((x * 2654435761L) & 0xFFFFFFFFL) >>> (32 - bits));
            while (true) {
                steps++; // one slot looked at
                if (!used[i]) {
                    used[i] = true;
                    keys[i] = x;
                    break;
                }
                if (keys[i] == x) break;
                i = (i + 1) % size;
            }
        }
        return steps;
    }

    static long mergeSort(int[] a) {
        return sort(a, new int[a.length], 0, a.length);
    }

    /** Sorts a[lo..hi) and returns the comparisons it made. */
    private static long sort(int[] a, int[] aux, int lo, int hi) {
        if (hi - lo < 2) return 0;
        int mid = (lo + hi) / 2;
        long steps = sort(a, aux, lo, mid) + sort(a, aux, mid, hi);
        System.arraycopy(a, lo, aux, lo, hi - lo);
        int i = lo, j = mid, k = lo;
        while (i < mid && j < hi) {
            steps++; // one comparison
            a[k++] = aux[i] <= aux[j] ? aux[i++] : aux[j++];
        }
        while (i < mid) a[k++] = aux[i++];
        while (j < hi) a[k++] = aux[j++];
        return steps;
    }

    static long insertionSort(int[] a) {
        long steps = 0;
        for (int j = 1; j < a.length; j++) {
            int key = a[j];
            int i = j - 1;
            while (i >= 0) {
                steps++; // one comparison
                if (a[i] <= key) break;
                a[i + 1] = a[i];
                i--;
            }
            a[i + 1] = key;
        }
        return steps;
    }

    /** Counts the triples that add up to 0. Returns {triples, steps}. */
    static long[] threeSum(int[] a) {
        int n = a.length;
        long triples = 0, steps = 0;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                for (int k = j + 1; k < n; k++) {
                    steps++; // one triple checked
                    if (a[i] + a[j] + a[k] == 0) triples++;
                }
            }
        }
        return new long[] {triples, steps};
    }

    static ToLongFunction<int[]> algorithm(String name) {
        return switch (name) {
            case "linear" -> Doubling::linearSearch;
            case "binary" -> Doubling::binarySearch;
            case "hash" -> Doubling::distinctValues;
            case "merge" -> Doubling::mergeSort;
            case "insertion" -> Doubling::insertionSort;
            case "threesum" -> a -> threeSum(a)[1];
            default -> throw new IllegalArgumentException("unknown algorithm " + name);
        };
    }

    /** One size of the experiment; b is NaN for the first size. */
    record Row(int n, long t, double b) {}

    static List<Row> doubling(
            ToLongFunction<int[]> algorithm, IntFunction<int[]> makeInput, int n, int largest) {
        List<Row> rows = new ArrayList<>();
        long before = 0;
        for (; n <= largest; n *= 2) {
            long t = algorithm.applyAsLong(makeInput.apply(n));
            double b = before > 0 ? Math.log((double) t / before) / Math.log(2) : Double.NaN;
            rows.add(new Row(n, t, b));
            before = t;
        }
        return rows;
    }
}
