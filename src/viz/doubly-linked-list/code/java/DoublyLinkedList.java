import java.util.NoSuchElementException;

/**
 * A doubly linked list with one sentinel node, nil. Indexes start at 0. nil.next is the first
 * node and nil.prev the last; an empty list is nil pointing at itself both ways.
 */
public class DoublyLinkedList<T> {
    private static class Node<T> {
        T value;
        Node<T> next;
        Node<T> prev;

        Node(T value) {
            this.value = value;
        }
    }

    private final Node<T> nil = new Node<>(null);
    private int n;

    public DoublyLinkedList() {
        nil.next = nil;
        nil.prev = nil;
    }

    private void linkBefore(Node<T> succ, T x) {
        Node<T> node = new Node<>(x);
        node.next = succ;
        node.prev = succ.prev;
        succ.prev.next = node; // while succ.prev is still the node before succ
        succ.prev = node;
        n++;
    }

    private T unlink(Node<T> cur) {
        cur.prev.next = cur.next;
        cur.next.prev = cur.prev;
        cur.next = null;
        cur.prev = null;
        n--;
        return cur.value;
    }

    private Node<T> nodeAt(int i) {
        Node<T> cur;
        if (2 * i < n) { // front half: walk forward from the first node
            cur = nil.next;
            for (int k = 0; k < i; k++) {
                cur = cur.next;
            }
        } else { // back half: walk back from the last node
            cur = nil.prev;
            for (int k = 0; k < n - 1 - i; k++) {
                cur = cur.prev;
            }
        }
        return cur;
    }

    public void insertHead(T x) {
        linkBefore(nil.next, x);
    }

    public void insertTail(T x) {
        linkBefore(nil, x);
    }

    public void insertAt(int i, T x) {
        if (i < 0 || i > n) {
            throw new IndexOutOfBoundsException("index out of range");
        }
        linkBefore(i == n ? nil : nodeAt(i), x);
    }

    public T removeHead() {
        if (nil.next == nil) {
            throw new NoSuchElementException("list is empty");
        }
        return unlink(nil.next);
    }

    public T removeTail() {
        if (nil.prev == nil) {
            throw new NoSuchElementException("list is empty");
        }
        return unlink(nil.prev);
    }

    public T removeAt(int i) {
        if (i < 0 || i >= n) {
            throw new IndexOutOfBoundsException("index out of range");
        }
        return unlink(nodeAt(i));
    }

    public boolean removeValue(T x) {
        Node<T> cur = nil.next;
        while (cur != nil && !cur.value.equals(x)) {
            cur = cur.next;
        }
        if (cur == nil) {
            return false;
        }
        unlink(cur);
        return true;
    }

    public int search(T x) {
        int i = 0;
        for (Node<T> cur = nil.next; cur != nil; cur = cur.next) {
            if (cur.value.equals(x)) {
                return i;
            }
            i++;
        }
        return -1;
    }

    public T get(int i) {
        if (i < 0 || i >= n) {
            throw new IndexOutOfBoundsException("index out of range");
        }
        return nodeAt(i).value;
    }

    public void reverse() {
        Node<T> cur = nil.next;
        while (cur != nil) {
            Node<T> tmp = cur.next;
            cur.next = cur.prev;
            cur.prev = tmp;
            cur = tmp;
        }
        Node<T> tmp = nil.next;
        nil.next = nil.prev;
        nil.prev = tmp;
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        for (Node<T> cur = nil.next; cur != nil; cur = cur.next) {
            if (sb.length() > 0) {
                sb.append(' ');
            }
            sb.append(cur.value);
        }
        return sb.toString();
    }
}
