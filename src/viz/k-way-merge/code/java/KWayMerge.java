import java.util.ArrayList;
import java.util.List;
import java.util.PriorityQueue;

public final class KWayMerge {
    private KWayMerge() {}

    /** Merge sorted lists into one sorted list. O(n log k) for n values in k lists. */
    public static List<Integer> mergeLists(List<List<Integer>> lists) {
        // One entry per list: {head value, list number, position}. Ties go in list order.
        PriorityQueue<int[]> heap =
                new PriorityQueue<>((a, b) -> a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]));
        for (int j = 0; j < lists.size(); j++) {
            if (!lists.get(j).isEmpty()) heap.offer(new int[] {lists.get(j).get(0), j, 0});
        }
        List<Integer> out = new ArrayList<>();
        while (!heap.isEmpty()) {
            int[] top = heap.poll(); // the smallest value left anywhere
            out.add(top[0]);
            int j = top[1], i = top[2] + 1;
            if (i < lists.get(j).size()) heap.offer(new int[] {lists.get(j).get(i), j, i});
        }
        return out;
    }
}
