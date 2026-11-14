import java.util.ArrayDeque;
import java.util.Deque;

/** A first-in, first-out queue made of two stacks: O(1) amortized per operation. */
public class TwoStackQueue {
    private final Deque<Integer> in = new ArrayDeque<>(); // new values go on top
    private final Deque<Integer> out = new ArrayDeque<>(); // the front of the queue is on top

    public void enqueue(int x) {
        in.push(x);
    }

    /** Throws NoSuchElementException if the queue is empty. */
    public int dequeue() {
        refill();
        return out.pop();
    }

    public int peek() {
        refill();
        return out.element();
    }

    public int size() {
        return in.size() + out.size();
    }

    // Only when out is empty: move everything across, which reverses the order.
    private void refill() {
        if (out.isEmpty()) {
            while (!in.isEmpty()) out.push(in.pop());
        }
    }
}
