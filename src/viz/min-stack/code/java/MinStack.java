import java.util.ArrayDeque;
import java.util.Deque;

/** A stack that also returns its minimum in O(1), with a second stack of minimums. */
public class MinStack {
    private final Deque<Integer> items = new ArrayDeque<>();
    // The top of mins is always the smallest value in items.
    private final Deque<Integer> mins = new ArrayDeque<>();

    public void push(int x) {
        items.push(x);
        if (mins.isEmpty() || x <= mins.peek()) mins.push(x);
    }

    /** Throws NoSuchElementException if the stack is empty. */
    public int pop() {
        int x = items.pop();
        if (x == mins.peek()) mins.pop();
        return x;
    }

    public int top() {
        return items.element();
    }

    public int getMin() {
        return mins.element();
    }

    public boolean isEmpty() {
        return items.isEmpty();
    }
}
