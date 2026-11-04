import java.util.HashMap;
import java.util.Map;

/**
 * A hash map from key to node, plus a doubly linked list in order of use: head is the most
 * recently used node, tail the least.
 */
public class LRUCache {
    private static class Node {
        final int key;
        int value;
        Node prev, next;

        Node(int key, int value) {
            this.key = key;
            this.value = value;
        }
    }

    private final int capacity;
    private final Map<Integer, Node> map = new HashMap<>();
    private Node head, tail;
    private int hits = 0, misses = 0;

    public LRUCache(int capacity) {
        this.capacity = capacity;
    }

    private void unlink(Node x) {
        if (x.prev != null) x.prev.next = x.next;
        else head = x.next;
        if (x.next != null) x.next.prev = x.prev;
        else tail = x.prev;
    }

    private void pushFront(Node x) {
        x.next = head;
        x.prev = null;
        if (head != null) head.prev = x;
        else tail = x;
        head = x;
    }

    public int get(int k) {
        Node x = map.get(k);
        if (x == null) {
            misses++;
            return -1;
        }
        hits++;
        if (x != head) {
            unlink(x);
            pushFront(x);
        }
        return x.value;
    }

    /** Stores v under k. Returns the key it evicted, or null. */
    public Integer put(int k, int v) {
        Node x = map.get(k);
        if (x != null) {
            x.value = v;
            if (x != head) {
                unlink(x);
                pushFront(x);
            }
            return null;
        }
        Integer evicted = null;
        if (map.size() == capacity) {
            Node y = tail;
            unlink(y);
            map.remove(y.key);
            evicted = y.key;
        }
        x = new Node(k, v);
        map.put(k, x);
        pushFront(x);
        return evicted;
    }

    public boolean contains(int k) {
        return map.containsKey(k);
    }

    /** "key=value" pairs from most to least recently used, then the hit and miss counts. */
    public String show() {
        StringBuilder sb = new StringBuilder();
        for (Node x = head; x != null; x = x.next) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(x.key).append('=').append(x.value);
        }
        return (sb.length() == 0 ? "empty" : sb.toString()) + " | " + hits + " " + misses;
    }
}
