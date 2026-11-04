import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

/** A singly linked circular list with only a tail pointer. tail.next is the front. */
public class CircularLinkedList<T> {
    private static class Node<T> {
        T value;
        Node<T> next;

        Node(T value) {
            this.value = value;
        }
    }

    private Node<T> tail;
    private int n;

    public void insertFront(T x) {
        Node<T> node = new Node<>(x);
        if (tail == null) {
            node.next = node; // one node: the node after the last one is itself
            tail = node;
        } else {
            node.next = tail.next;
            tail.next = node;
        }
        n++;
    }

    public void insertBack(T x) {
        insertFront(x); // the new node goes right after tail...
        tail = tail.next; // ...and moving tail makes it the back
    }

    public T removeFront() {
        if (tail == null) {
            throw new NoSuchElementException("list is empty");
        }
        Node<T> first = tail.next;
        if (first == tail) {
            tail = null;
        } else {
            tail.next = first.next;
        }
        n--;
        return first.value;
    }

    public void rotate() {
        if (tail != null) {
            tail = tail.next;
        }
    }

    public List<T> traverse() {
        List<T> values = new ArrayList<>();
        if (tail == null) {
            return values;
        }
        Node<T> cur = tail.next;
        do {
            values.add(cur.value);
            cur = cur.next;
        } while (cur != tail.next); // back at the front: stop, there is no null
        return values;
    }

    public int search(T x) {
        if (tail == null) {
            return -1;
        }
        Node<T> cur = tail.next;
        int i = 0;
        do {
            if (cur.value.equals(x)) {
                return i;
            }
            cur = cur.next;
            i++;
        } while (cur != tail.next);
        return -1;
    }
}
