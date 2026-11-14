import java.util.HashMap;
import java.util.Map;

public final class PrefixSums {
    private PrefixSums() {}

    /** How many subarrays (non-empty, contiguous) of a sum to k. One pass, O(n). */
    public static int countSumK(int[] a, int k) {
        Map<Integer, Integer> seen = new HashMap<>(); // running sum -> times it has appeared
        seen.put(0, 1); // the empty prefix
        int total = 0, count = 0;
        for (int x : a) {
            total += x;
            count += seen.getOrDefault(total - k, 0); // each earlier total - k starts one here
            seen.merge(total, 1, Integer::sum);
        }
        return count;
    }

    /** {length, start} of the longest subarray with sum k, or {0, -1} if there is none. */
    public static int[] longestSumK(int[] a, int k) {
        Map<Integer, Integer> first = new HashMap<>(); // running sum -> values it took to appear
        first.put(0, 0);
        int total = 0, best = 0, start = -1;
        for (int j = 1; j <= a.length; j++) {
            total += a[j - 1];
            Integer i = first.get(total - k);
            if (i != null && j - i > best) { // a[i..j-1] sums to k
                best = j - i;
                start = i;
            }
            first.putIfAbsent(total, j); // keep the first: an earlier start is longer
        }
        return new int[] {best, start};
    }
}
