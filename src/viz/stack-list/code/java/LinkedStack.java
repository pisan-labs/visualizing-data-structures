import java.util.NoSuchElementException;

/** A stack on a singly linked list. top is the head of the list. */
public class LinkedStack<T> {
    private static class Node<T> {
        T value;
        Node<T> next;

        Node(T value) {
            this.value = value;
        }
    }

    private Node<T> top = null;

    public void push(T x) {
        Node<T> node = new Node<>(x);
        node.next = top;
        top = node;
    }

    public T pop() {
        if (top == null) {
            throw new NoSuchElementException("stack underflow");
        }
        T x = top.value;
        top = top.next;
        return x;
    }

    public T peek() {
        if (top == null) {
            throw new NoSuchElementException("stack is empty");
        }
        return top.value;
    }

    public boolean isEmpty() {
        return top == null;
    }
}
