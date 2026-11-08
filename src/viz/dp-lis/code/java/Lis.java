import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Lis {
    private static List<Integer> walkBack(int[] a, int[] prev, int i) {
        List<Integer> out = new ArrayList<>();
        for (; i != -1; i = prev[i]) {
            out.add(a[i]);
        }
        Collections.reverse(out);
        return out;
    }

    /** O(n^2): length[i] is the longest increasing run ending at a[i]; prev[i] the index before. */
    public static List<Integer> table(int[] a) {
        int n = a.length;
        int[] length = new int[n];
        int[] prev = new int[n];
        int end = 0;
        for (int i = 0; i < n; i++) {
            length[i] = 1;
            prev[i] = -1;
            for (int j = 0; j < i; j++) {
                if (a[j] < a[i] && length[j] + 1 > length[i]) {
                    length[i] = length[j] + 1;
                    prev[i] = j;
                }
            }
            if (length[i] > length[end]) {
                end = i;
            }
        }
        return walkBack(a, prev, end);
    }

    /** O(n log n): tails[k] is the index of the smallest value ending a run of length k + 1. */
    public static List<Integer> tails(int[] a) {
        int[] tails = new int[a.length];
        int[] prev = new int[a.length];
        int size = 0;
        for (int i = 0; i < a.length; i++) {
            int lo = 0;
            int hi = size;
            while (lo < hi) { // the first tail >= a[i]
                int mid = (lo + hi) / 2;
                if (a[tails[mid]] < a[i]) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
            prev[i] = lo > 0 ? tails[lo - 1] : -1;
            tails[lo] = i;
            if (lo == size) {
                size++;
            }
        }
        return walkBack(a, prev, tails[size - 1]);
    }
}
