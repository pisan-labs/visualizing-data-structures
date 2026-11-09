import java.util.ArrayDeque;
import java.util.Deque;

public final class MonotonicQueue {
    private MonotonicQueue() {}

    /** The maximum of every window of k consecutive values. */
    public static int[] windowMax(int[] a, int k) {
        int[] out = new int[a.length - k + 1];
        Deque<Integer> d = new ArrayDeque<>(); // indices; values decrease front to back
        for (int i = 0; i < a.length; i++) {
            if (!d.isEmpty() && d.peekFirst() == i - k) d.pollFirst(); // left the window
            while (!d.isEmpty() && a[d.peekLast()] <= a[i]) d.pollLast(); // can never win
            d.addLast(i);
            if (i >= k - 1) out[i - k + 1] = a[d.peekFirst()];
        }
        return out;
    }

    /** The minimum of every window of k consecutive values. */
    public static int[] windowMin(int[] a, int k) {
        int[] out = new int[a.length - k + 1];
        Deque<Integer> d = new ArrayDeque<>(); // indices; values increase front to back
        for (int i = 0; i < a.length; i++) {
            if (!d.isEmpty() && d.peekFirst() == i - k) d.pollFirst();
            while (!d.isEmpty() && a[d.peekLast()] >= a[i]) d.pollLast();
            d.addLast(i);
            if (i >= k - 1) out[i - k + 1] = a[d.peekFirst()];
        }
        return out;
    }
}
