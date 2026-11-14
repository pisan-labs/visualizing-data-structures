import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public class Intervals {
    /** Merge overlapping intervals {start, end}; touching ends merge too. O(n log n). */
    static List<int[]> merge(int[][] intervals) {
        int[][] sorted = intervals.clone();
        Arrays.sort(sorted, Comparator.comparingInt(iv -> iv[0])); // by start
        List<int[]> out = new ArrayList<>();
        for (int[] iv : sorted) {
            int[] last = out.isEmpty() ? null : out.get(out.size() - 1);
            if (last != null && iv[0] <= last[1]) {
                last[1] = Math.max(last[1], iv[1]); // reaches the last one out
            } else {
                out.add(new int[] {iv[0], iv[1]}); // starts after it: a new one
            }
        }
        return out;
    }

    /** Insert x into a sorted list of intervals that do not overlap. O(n). */
    static List<int[]> insert(int[][] intervals, int[] x) {
        List<int[]> out = new ArrayList<>();
        int start = x[0], end = x[1], i = 0, n = intervals.length;
        while (i < n && intervals[i][1] < start) out.add(intervals[i++]); // ends before x
        while (i < n && intervals[i][0] <= end) { // overlaps x: absorb it
            start = Math.min(start, intervals[i][0]);
            end = Math.max(end, intervals[i][1]);
            i++;
        }
        out.add(new int[] {start, end});
        while (i < n) out.add(intervals[i++]); // the rest start after x ends
        return out;
    }

    /** What two sorted lists of non-overlapping intervals have in common. O(m + n). */
    static List<int[]> intersect(int[][] a, int[][] b) {
        List<int[]> out = new ArrayList<>();
        int i = 0, j = 0;
        while (i < a.length && j < b.length) {
            int lo = Math.max(a[i][0], b[j][0]);
            int hi = Math.min(a[i][1], b[j][1]);
            if (lo <= hi) out.add(new int[] {lo, hi});
            if (a[i][1] < b[j][1]) i++; // the one that ends first can meet nothing more
            else j++;
        }
        return out;
    }
}
