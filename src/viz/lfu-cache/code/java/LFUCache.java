import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.TreeMap;

/**
 * Evicts the key used the fewest times; on a tie, the least recently used of them. entries maps
 * a key to {value, freq}. lists maps each frequency f to the keys used f times, least recently
 * used first: a LinkedHashSet is a hash table threaded on a doubly linked list, so removing any
 * key and taking the oldest are both O(1). minFreq is the smallest frequency in use.
 */
public class LFUCache {
    private final int capacity;
    private final Map<Integer, int[]> entries = new HashMap<>();
    private final Map<Integer, LinkedHashSet<Integer>> lists = new HashMap<>();
    private int minFreq = 0;
    public int hits = 0, misses = 0;

    public LFUCache(int capacity) {
        this.capacity = capacity;
    }

    /** Moves k from the list for its frequency to the tail of the next one. */
    private void bump(int k) {
        int[] entry = entries.get(k);
        int f = entry[1];
        LinkedHashSet<Integer> list = lists.get(f);
        list.remove(k);
        if (list.isEmpty()) {
            lists.remove(f);
            if (minFreq == f) minFreq = f + 1;
        }
        entry[1] = f + 1;
        lists.computeIfAbsent(f + 1, x -> new LinkedHashSet<>()).add(k);
    }

    public int get(int k) {
        int[] entry = entries.get(k);
        if (entry == null) {
            misses++;
            return -1;
        }
        hits++;
        bump(k);
        return entry[0];
    }

    /** Stores v under k. Returns the key it evicted, or null. */
    public Integer put(int k, int v) {
        int[] entry = entries.get(k);
        if (entry != null) {
            entry[0] = v;
            bump(k);
            return null;
        }
        Integer evicted = null;
        if (entries.size() == capacity) {
            LinkedHashSet<Integer> oldest = lists.get(minFreq);
            evicted = oldest.iterator().next();
            oldest.remove(evicted);
            if (oldest.isEmpty()) lists.remove(minFreq);
            entries.remove(evicted);
        }
        entries.put(k, new int[] {v, 1});
        lists.computeIfAbsent(1, x -> new LinkedHashSet<>()).add(k);
        minFreq = 1;
        return evicted;
    }

    public boolean contains(int k) {
        return entries.containsKey(k);
    }

    public int minFreq() {
        return minFreq;
    }

    /** The lists by frequency, lowest first, each least recently used first. */
    public TreeMap<Integer, LinkedHashSet<Integer>> lists() {
        return new TreeMap<>(lists);
    }
}
