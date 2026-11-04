import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** B buckets of b slots each. Keys that do not fit go to a shared overflow area. */
public class BucketHashTable {
    private final Integer[][] buckets; // null marks a free slot
    private final List<Integer> overflow = new ArrayList<>();
    private int probes = 0; // slots looked at by the last operation

    public BucketHashTable(int B, int b) {
        buckets = new Integer[B][b];
    }

    private int h(int k) {
        return k % buckets.length;
    }

    /** Adds k and returns true, or returns false if k is already there. */
    public boolean insert(int k) {
        probes = 0;
        Integer[] bucket = buckets[h(k)];
        int free = -1;
        for (int t = 0; t < bucket.length; t++) {
            probes++;
            if (bucket[t] != null && bucket[t] == k) return false;
            if (bucket[t] == null && free < 0) free = t;
        }
        if (free >= 0) {
            bucket[free] = k;
            return true;
        }
        for (int x : overflow) {
            probes++;
            if (x == k) return false;
        }
        overflow.add(k);
        return true;
    }

    public boolean search(int k) {
        probes = 0;
        Integer[] bucket = buckets[h(k)];
        for (Integer x : bucket) {
            probes++;
            if (x != null && x == k) return true;
        }
        if (hasRoom(bucket)) return false; // k never overflowed
        for (int x : overflow) {
            probes++;
            if (x == k) return true;
        }
        return false;
    }

    public boolean delete(int k) {
        probes = 0;
        int i = h(k);
        Integer[] bucket = buckets[i];
        for (int t = 0; t < bucket.length; t++) {
            probes++;
            if (bucket[t] != null && bucket[t] == k) {
                bucket[t] = null;
                // Pull a key of this bucket back from the overflow area.
                for (int p = 0; p < overflow.size(); p++) {
                    if (h(overflow.get(p)) == i) {
                        bucket[t] = overflow.remove(p);
                        break;
                    }
                }
                return true;
            }
        }
        if (hasRoom(bucket)) return false;
        for (int p = 0; p < overflow.size(); p++) {
            probes++;
            if (overflow.get(p) == k) {
                overflow.remove(p);
                return true;
            }
        }
        return false;
    }

    private static boolean hasRoom(Integer[] bucket) {
        for (Integer x : bucket) {
            if (x == null) return true;
        }
        return false;
    }

    public void clear() {
        for (Integer[] bucket : buckets) Arrays.fill(bucket, null);
        overflow.clear();
    }

    public int probes() {
        return probes;
    }

    /** The buckets, then the overflow area, as text. */
    public String show() {
        List<String> parts = new ArrayList<>();
        for (Integer[] bucket : buckets) {
            List<String> slots = new ArrayList<>();
            for (Integer x : bucket) slots.add(x == null ? "-" : x.toString());
            parts.add(String.join(" ", slots));
        }
        List<String> over = new ArrayList<>();
        for (int x : overflow) over.add(String.valueOf(x));
        return String.join(" | ", parts) + " || " + (over.isEmpty() ? "-" : String.join(" ", over));
    }
}
