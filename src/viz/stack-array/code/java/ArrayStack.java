import java.util.NoSuchElementException;

/** A stack stored in a fixed-size array. top counts the items. */
public class ArrayStack<T> {
    private final Object[] data;
    private int top = 0;

    public ArrayStack(int capacity) {
        data = new Object[capacity];
    }

    public void push(T x) {
        if (top == data.length) {
            throw new IllegalStateException("stack overflow");
        }
        data[top] = x;
        top = top + 1;
    }

    @SuppressWarnings("unchecked")
    public T pop() {
        if (top == 0) {
            throw new NoSuchElementException("stack underflow");
        }
        top = top - 1;
        return (T) data[top];
    }

    @SuppressWarnings("unchecked")
    public T peek() {
        if (top == 0) {
            throw new NoSuchElementException("stack is empty");
        }
        return (T) data[top - 1];
    }

    public void clear() {
        top = 0;
    }

    public boolean isEmpty() {
        return top == 0;
    }
}
