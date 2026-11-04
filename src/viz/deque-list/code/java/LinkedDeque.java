import java.util.NoSuchElementException;

/** A double-ended queue on a doubly linked list with head and tail. */
public class LinkedDeque<T> {
    private static class Node<T> {
        T value;
        Node<T> prev;
        Node<T> next;

        Node(T value) {
            this.value = value;
        }
    }

    private Node<T> head = null;
    private Node<T> tail = null;

    public void addFirst(T x) {
        Node<T> node = new Node<>(x);
        node.next = head;
        if (head == null) {
            tail = node;
        } else {
            head.prev = node;
        }
        head = node;
    }

    public void addLast(T x) {
        Node<T> node = new Node<>(x);
        node.prev = tail;
        if (tail == null) {
            head = node;
        } else {
            tail.next = node;
        }
        tail = node;
    }

    public T removeFirst() {
        if (head == null) {
            throw new NoSuchElementException("deque underflow");
        }
        T x = head.value;
        head = head.next;
        if (head == null) {
            tail = null;
        } else {
            head.prev = null;
        }
        return x;
    }

    public T removeLast() {
        if (tail == null) {
            throw new NoSuchElementException("deque underflow");
        }
        T x = tail.value;
        tail = tail.prev;
        if (tail == null) {
            head = null;
        } else {
            tail.next = null;
        }
        return x;
    }

    public T peekFirst() {
        if (head == null) {
            throw new NoSuchElementException("deque is empty");
        }
        return head.value;
    }

    public T peekLast() {
        if (tail == null) {
            throw new NoSuchElementException("deque is empty");
        }
        return tail.value;
    }
}
