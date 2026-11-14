import java.util.ArrayList;
import java.util.List;
import java.util.PriorityQueue;

public final class TopK {
    private TopK() {}

    /** The k largest values of a, in no particular order. O(n log k) time, O(k) extra space. */
    public static List<Integer> topK(int[] a, int k) {
        PriorityQueue<Integer> heap = new PriorityQueue<>(); // a min-heap of the best k so far
        for (int x : a) {
            if (heap.size() < k) {
                heap.offer(x);
            } else if (x > heap.peek()) { // x beats the smallest of the best k
                heap.poll();
                heap.offer(x);
            }
        }
        return new ArrayList<>(heap);
    }

    /** The k-th largest value of a (k = 1 is the largest): the smallest of the k largest. */
    public static int kthLargest(int[] a, int k) {
        int kth = Integer.MAX_VALUE;
        for (int x : topK(a, k)) kth = Math.min(kth, x);
        return kth;
    }
}
