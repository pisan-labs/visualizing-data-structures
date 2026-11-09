import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;

public final class MonotonicStack {
    private MonotonicStack() {}

    /** For each value, the first bigger value to its right, or -1. */
    public static int[] nextGreater(int[] a) {
        int[] ans = new int[a.length];
        Arrays.fill(ans, -1);
        Deque<Integer> stack = new ArrayDeque<>(); // indices; values decrease to the top
        for (int i = 0; i < a.length; i++) {
            while (!stack.isEmpty() && a[stack.peek()] < a[i]) ans[stack.pop()] = a[i];
            stack.push(i);
        }
        return ans;
    }

    /** For each value, the nearest smaller value to its left, or -1. */
    public static int[] previousSmaller(int[] a) {
        int[] ans = new int[a.length];
        Deque<Integer> stack = new ArrayDeque<>(); // indices; values increase to the top
        for (int i = 0; i < a.length; i++) {
            while (!stack.isEmpty() && a[stack.peek()] >= a[i]) stack.pop();
            ans[i] = stack.isEmpty() ? -1 : a[stack.peek()];
            stack.push(i);
        }
        return ans;
    }

    /** The largest rectangle under bars of heights h, each 1 wide. */
    public static int largestRectangle(int[] h) {
        int best = 0;
        Deque<Integer> stack = new ArrayDeque<>(); // indices; heights increase to the top
        for (int i = 0; i <= h.length; i++) {
            int height = i < h.length ? h[i] : 0;
            while (!stack.isEmpty() && h[stack.peek()] >= height) {
                int j = stack.pop();
                int left = stack.isEmpty() ? 0 : stack.peek() + 1;
                best = Math.max(best, h[j] * (i - left));
            }
            stack.push(i);
        }
        return best;
    }
}
