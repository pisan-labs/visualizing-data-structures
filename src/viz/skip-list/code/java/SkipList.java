import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

/**
 * A skip list, after Pugh. A new node starts 1 level tall and grows one level per heads, up to
 * maxLevel. Keys are not repeated.
 */
public class SkipList {
    static class Node {
        final int key;
        final Node[] next; // next[i] is the next node on level i + 1

        Node(int key, int level) {
            this.key = key;
            this.next = new Node[level];
        }
    }

    final double p;
    final int maxLevel;
    final Node head;
    int level = 0; // levels in use
    final Random random;

    SkipList(double p, int maxLevel, long seed) {
        this.p = p;
        this.maxLevel = maxLevel;
        this.head = new Node(Integer.MIN_VALUE, maxLevel);
        this.random = new Random(seed);
    }

    private int randomLevel() {
        int lvl = 1;
        while (random.nextDouble() < p && lvl < maxLevel) lvl++;
        return lvl;
    }

    /** The last node before k on every level (the head on unused levels). */
    private Node[] find(int k) {
        Node[] update = new Node[maxLevel];
        Arrays.fill(update, head);
        Node x = head;
        for (int i = level - 1; i >= 0; i--) {
            while (x.next[i] != null && x.next[i].key < k) x = x.next[i]; // right
            update[i] = x; // then down
        }
        return update;
    }

    public boolean search(int k) {
        Node x = find(k)[0].next[0];
        return x != null && x.key == k;
    }

    public boolean insert(int k) {
        Node[] update = find(k);
        Node x = update[0].next[0];
        if (x != null && x.key == k) return false;
        int lvl = randomLevel();
        level = Math.max(level, lvl);
        Node z = new Node(k, lvl);
        for (int i = 0; i < lvl; i++) {
            z.next[i] = update[i].next[i];
            update[i].next[i] = z;
        }
        return true;
    }

    public boolean delete(int k) {
        Node[] update = find(k);
        Node x = update[0].next[0];
        if (x == null || x.key != k) return false;
        for (int i = 0; i < x.next.length; i++) update[i].next[i] = x.next[i];
        while (level > 0 && head.next[level - 1] == null) level--; // the top level is empty
        return true;
    }

    /** All keys in order, along level 1. */
    public List<Integer> keys() {
        List<Integer> out = new ArrayList<>();
        for (Node x = head.next[0]; x != null; x = x.next[0]) out.add(x.key);
        return out;
    }
}
