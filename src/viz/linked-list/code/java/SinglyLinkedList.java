import java.util.NoSuchElementException;

/** A singly linked list with head and tail pointers. Indexes start at 0. */
public class SinglyLinkedList<T> {
    private static class Node<T> {
        T value;
        Node<T> next;

        Node(T value) {
            this.value = value;
        }
    }

    private Node<T> head;
    private Node<T> tail;
    private int n;

    public void insertHead(T x) {
        Node<T> node = new Node<>(x);
        node.next = head; // first link the new node in...
        head = node; // ...then move head, or the list is lost
        if (tail == null) {
            tail = node;
        }
        n++;
    }

    public void insertTail(T x) {
        Node<T> node = new Node<>(x);
        if (head == null) {
            head = node;
        } else {
            tail.next = node;
        }
        tail = node;
        n++;
    }

    public void insertAt(int i, T x) {
        if (i < 0 || i > n) {
            throw new IndexOutOfBoundsException("index out of range");
        }
        Node<T> node = new Node<>(x);
        if (i == 0) {
            node.next = head;
            head = node;
        } else {
            Node<T> prev = head;
            for (int k = 0; k < i - 1; k++) {
                prev = prev.next;
            }
            node.next = prev.next;
            prev.next = node;
        }
        if (node.next == null) {
            tail = node;
        }
        n++;
    }

    public T removeHead() {
        if (head == null) {
            throw new NoSuchElementException("list is empty");
        }
        T x = head.value;
        head = head.next;
        if (head == null) {
            tail = null;
        }
        n--;
        return x;
    }

    public T removeTail() {
        if (head == null) {
            throw new NoSuchElementException("list is empty");
        }
        T x;
        if (head.next == null) {
            x = head.value;
            head = null;
            tail = null;
        } else {
            Node<T> prev = head;
            while (prev.next != tail) { // walk: tail can't tell us its predecessor
                prev = prev.next;
            }
            x = prev.next.value;
            prev.next = null;
            tail = prev;
        }
        n--;
        return x;
    }

    public T removeAt(int i) {
        if (i < 0 || i >= n) {
            throw new IndexOutOfBoundsException("index out of range");
        }
        Node<T> prev = null;
        Node<T> cur = head;
        for (int k = 0; k < i; k++) {
            prev = cur;
            cur = cur.next;
        }
        unlink(prev, cur);
        return cur.value;
    }

    public boolean removeValue(T x) {
        Node<T> prev = null;
        Node<T> cur = head;
        while (cur != null && !cur.value.equals(x)) {
            prev = cur;
            cur = cur.next;
        }
        if (cur == null) {
            return false;
        }
        unlink(prev, cur);
        return true;
    }

    private void unlink(Node<T> prev, Node<T> cur) {
        if (prev == null) {
            head = cur.next;
        } else {
            prev.next = cur.next;
        }
        if (cur == tail) {
            tail = prev;
        }
        n--;
    }

    public int search(T x) {
        int i = 0;
        for (Node<T> cur = head; cur != null; cur = cur.next) {
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
        Node<T> cur = head;
        for (int k = 0; k < i; k++) {
            cur = cur.next;
        }
        return cur.value;
    }

    public void reverse() {
        Node<T> prev = null;
        Node<T> cur = head;
        tail = head;
        while (cur != null) {
            Node<T> next = cur.next; // save the rest of the list first
            cur.next = prev;
            prev = cur;
            cur = next;
        }
        head = prev;
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        for (Node<T> cur = head; cur != null; cur = cur.next) {
            if (sb.length() > 0) {
                sb.append(' ');
            }
            sb.append(cur.value);
        }
        return sb.toString();
    }
}
