import java.util.Collections;
import java.util.PriorityQueue;

/** The median of the values added so far: add is O(log n), median is O(1). */
public final class RunningMedian {
    private final PriorityQueue<Integer> low = new PriorityQueue<>(Collections.reverseOrder()); // smaller half
    private final PriorityQueue<Integer> high = new PriorityQueue<>(); // larger half

    public void add(int x) {
        if (low.isEmpty() || x <= low.peek()) {
            low.offer(x);
        } else {
            high.offer(x);
        }
        // Rebalance, so low holds as many as high or one more.
        if (low.size() > high.size() + 1) {
            high.offer(low.poll());
        } else if (high.size() > low.size()) {
            low.offer(high.poll());
        }
    }

    /** The middle value, or the mean of the two middle values for an even count. */
    public double median() {
        if (low.size() > high.size()) return low.peek();
        return (low.peek() + high.peek()) / 2.0;
    }

    /** The middle value, or the lower of the two middle values. */
    public int lowerMedian() {
        return low.peek();
    }
}
