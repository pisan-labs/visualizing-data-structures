import java.util.NoSuchElementException;

/** A FIFO queue on a singly linked list: dequeue at head, enqueue after tail. */
public class LinkedQueue<T> {
    private static class Node<T> {
        T value;
        Node<T> next;

        Node(T value) {
            this.value = value;
        }
    }

    private Node<T> head = null;
    private Node<T> tail = null;

    public void enqueue(T x) {
        Node<T> node = new Node<>(x);
        if (tail == null) {
            head = node;
        } else {
            tail.next = node;
        }
        tail = node;
    }

    public T dequeue() {
        if (head == null) {
            throw new NoSuchElementException("queue underflow");
        }
        T x = head.value;
        head = head.next;
        if (head == null) {
            tail = null;
        }
        return x;
    }

    public T peek() {
        if (head == null) {
            throw new NoSuchElementException("queue is empty");
        }
        return head.value;
    }

    public boolean isEmpty() {
        return head == null;
    }
}
