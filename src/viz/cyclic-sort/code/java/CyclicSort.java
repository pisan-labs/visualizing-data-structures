import java.util.ArrayList;
import java.util.List;

public class CyclicSort {
    /**
     * a holds n numbers, each from 1 to n. Puts each value v at its home, a[v - 1], in place.
     * Each swap sends one value home for good, so at most n - 1 swaps.
     */
    public static void sort(int[] a) {
        int i = 0;
        while (i < a.length) {
            int j = a[i] - 1; // where a[i] belongs
            if (a[i] != a[j]) {
                int t = a[i]; // a[j] is home; look at the new a[i]
                a[i] = a[j];
                a[j] = t;
            } else {
                i++; // home already, or a repeat whose home is taken
            }
        }
    }

    /** Sorts a, then returns {missing, repeated}: the numbers from 1 to n missing, and the repeats. */
    public static List<List<Integer>> missingAndRepeated(int[] a) {
        sort(a);
        List<Integer> missing = new ArrayList<>();
        List<Integer> repeated = new ArrayList<>();
        for (int i = 0; i < a.length; i++) {
            if (a[i] != i + 1) { // slot i should hold i + 1
                missing.add(i + 1);
                repeated.add(a[i]);
            }
        }
        return List.of(missing, repeated);
    }
}
