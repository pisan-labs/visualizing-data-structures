import java.util.NoSuchElementException;

/**
 * A double-ended queue in a fixed-size circular array. front is the first item and rear is
 * the slot after the last item. One slot always stays empty, so front == rear means empty.
 */
public class ArrayDeque<T> {
    private final Object[] data;
    private int front = 0;
    private int rear = 0;

    public ArrayDeque(int capacity) {
        data = new Object[capacity];
    }

    public boolean isFull() {
        return (rear + 1) % data.length == front;
    }

    public boolean isEmpty() {
        return front == rear;
    }

    public void addFirst(T x) {
        if (isFull()) {
            throw new IllegalStateException("deque overflow");
        }
        // In Java, -1 % n is -1, so add the capacity before taking the remainder.
        front = (front - 1 + data.length) % data.length;
        data[front] = x;
    }

    public void addLast(T x) {
        if (isFull()) {
            throw new IllegalStateException("deque overflow");
        }
        data[rear] = x;
        rear = (rear + 1) % data.length;
    }

    @SuppressWarnings("unchecked")
    public T removeFirst() {
        if (isEmpty()) {
            throw new NoSuchElementException("deque underflow");
        }
        T x = (T) data[front];
        front = (front + 1) % data.length;
        return x;
    }

    @SuppressWarnings("unchecked")
    public T removeLast() {
        if (isEmpty()) {
            throw new NoSuchElementException("deque underflow");
        }
        rear = (rear - 1 + data.length) % data.length;
        return (T) data[rear];
    }

    @SuppressWarnings("unchecked")
    public T peekFirst() {
        if (isEmpty()) {
            throw new NoSuchElementException("deque is empty");
        }
        return (T) data[front];
    }

    @SuppressWarnings("unchecked")
    public T peekLast() {
        if (isEmpty()) {
            throw new NoSuchElementException("deque is empty");
        }
        return (T) data[(rear - 1 + data.length) % data.length];
    }
}
