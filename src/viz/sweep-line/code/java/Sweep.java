import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.PriorityQueue;
import java.util.TreeSet;

public class Sweep {
    /** The most intervals {start, end} open at once, ends first at equal times. O(n log n). */
    static int mostOpen(int[][] intervals) {
        int[][] events = new int[2 * intervals.length][];
        for (int k = 0; k < intervals.length; k++) {
            events[2 * k] = new int[] {intervals[k][0], +1};
            events[2 * k + 1] = new int[] {intervals[k][1], -1};
        }
        // By time; at equal times -1 sorts first: ends before starts.
        Arrays.sort(events, (a, b) -> a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]));
        int open = 0, best = 0;
        for (int[] e : events) {
            open += e[1];
            best = Math.max(best, open);
        }
        return best;
    }

    /** Key points {x, height} of the outline of buildings {left, right, height}. O(n log n). */
    static List<int[]> skyline(int[][] buildings) {
        TreeSet<Integer> xs = new TreeSet<>();
        for (int[] b : buildings) { xs.add(b[0]); xs.add(b[1]); }
        int[][] byLeft = buildings.clone();
        Arrays.sort(byLeft, (a, b) -> Integer.compare(a[0], b[0]));
        // {height, right}, the tallest on top.
        PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> Integer.compare(b[0], a[0]));
        List<int[]> out = new ArrayList<>();
        int i = 0, prev = 0;
        for (int x : xs) {
            while (i < byLeft.length && byLeft[i][0] == x) { // push what starts here
                heap.add(new int[] {byLeft[i][2], byLeft[i][1]});
                i++;
            }
            while (!heap.isEmpty() && heap.peek()[1] <= x) heap.poll(); // lazy removal
            int height = heap.isEmpty() ? 0 : heap.peek()[0];
            if (height != prev) out.add(new int[] {x, height});
            prev = height;
        }
        return out;
    }
}
