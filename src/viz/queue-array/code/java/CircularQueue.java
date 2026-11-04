import java.util.NoSuchElementException;

/**
 * A FIFO queue in a fixed-size circular array. rear is the next free slot.
 * One slot always stays empty, so front == rear means empty.
 */
public class CircularQueue<T> {
    private final Object[] data;
    private int front = 0;
    private int rear = 0;

    public CircularQueue(int capacity) {
        data = new Object[capacity];
    }

    public void enqueue(T x) {
        if ((rear + 1) % data.length == front) {
            throw new IllegalStateException("queue overflow");
        }
        data[rear] = x;
        rear = (rear + 1) % data.length;
    }

    @SuppressWarnings("unchecked")
    public T dequeue() {
        if (front == rear) {
            throw new NoSuchElementException("queue underflow");
        }
        T x = (T) data[front];
        front = (front + 1) % data.length;
        return x;
    }

    @SuppressWarnings("unchecked")
    public T peek() {
        if (front == rear) {
            throw new NoSuchElementException("queue is empty");
        }
        return (T) data[front];
    }

    public void clear() {
        front = 0;
        rear = 0;
    }

    public int size() {
        return (rear - front + data.length) % data.length;
    }
}
