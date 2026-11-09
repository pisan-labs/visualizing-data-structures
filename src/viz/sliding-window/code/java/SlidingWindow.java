import java.util.HashMap;
import java.util.Map;

public final class SlidingWindow {
    private SlidingWindow() {}

    /** {best, start}: the largest sum of k values in a row, and where it starts. */
    public static int[] maxSum(int[] a, int k) {
        int sum = 0;
        for (int i = 0; i < k; i++) sum += a[i];
        int best = sum, at = 0;
        for (int r = k; r < a.length; r++) {
            sum += a[r] - a[r - k]; // a[r] enters, a[r - k] leaves
            if (sum > best) {
                best = sum;
                at = r - k + 1;
            }
        }
        return new int[] {best, at};
    }

    /** Length of the shortest window with sum >= target (values >= 0), or 0. */
    public static int shortestAtLeast(int[] a, int target) {
        int best = a.length + 1, left = 0, sum = 0;
        for (int right = 0; right < a.length; right++) {
            sum += a[right];
            while (sum >= target) {
                best = Math.min(best, right - left + 1);
                sum -= a[left++];
            }
        }
        return best > a.length ? 0 : best;
    }

    /** {length, start} of the longest window with no repeated value. */
    public static int[] longestDistinct(int[] a) {
        Map<Integer, Integer> count = new HashMap<>();
        int best = 0, at = 0, left = 0;
        for (int right = 0; right < a.length; right++) {
            count.merge(a[right], 1, Integer::sum);
            while (count.get(a[right]) > 1) count.merge(a[left++], -1, Integer::sum);
            if (right - left + 1 > best) {
                best = right - left + 1;
                at = left;
            }
        }
        return new int[] {best, at};
    }
}
