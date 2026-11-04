import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Separate chaining: T[i] points at a linked list of the keys that hash to i. */
public class ChainedHashTable {
    private static class Node {
        final int key;
        Node next;

        Node(int key, Node next) {
            this.key = key;
            this.next = next;
        }
    }

    private final Node[] T;
    private int n = 0;

    public ChainedHashTable(int m) {
        T = new Node[m];
    }

    /** The division method. Keys are not negative, so % gives a valid index. */
    public int h(int k) {
        return k % T.length;
    }

    public boolean insert(int k) {
        int i = h(k);
        for (Node x = T[i]; x != null; x = x.next) {
            if (x.key == k) {
                return false; // already there
            }
        }
        T[i] = new Node(k, T[i]); // the new node goes first
        n++;
        return true;
    }

    public boolean contains(int k) {
        for (Node x = T[h(k)]; x != null; x = x.next) {
            if (x.key == k) {
                return true;
            }
        }
        return false;
    }

    public boolean delete(int k) {
        int i = h(k);
        Node prev = null;
        Node x = T[i];
        while (x != null && x.key != k) {
            prev = x;
            x = x.next;
        }
        if (x == null) {
            return false;
        }
        if (prev == null) {
            T[i] = x.next;
        } else {
            prev.next = x.next;
        }
        n--;
        return true;
    }

    public void clear() {
        Arrays.fill(T, null);
        n = 0;
    }

    public double loadFactor() {
        return (double) n / T.length;
    }

    public int buckets() {
        return T.length;
    }

    public List<Integer> chain(int i) {
        List<Integer> keys = new ArrayList<>();
        for (Node x = T[i]; x != null; x = x.next) {
            keys.add(x.key);
        }
        return keys;
    }
}
