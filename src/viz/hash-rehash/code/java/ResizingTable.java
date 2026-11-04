/**
 * Linear probing. When one more key would push α above 0.75, the table grows to the first
 * prime at least twice its size and every key moves.
 */
public class ResizingTable {
    private static final double MAX_LOAD = 0.75;

    private Integer[] table; // null marks an empty slot
    private int n = 0;
    private long total = 0; // cost of all inserts so far: stores plus moves

    public ResizingTable(int m) {
        table = new Integer[m];
    }

    /** The first slot of k's probe sequence in t that is empty or holds k. */
    private static int slot(Integer[] t, int k) {
        int j = k % t.length;
        while (t[j] != null && t[j] != k) j = (j + 1) % t.length;
        return j;
    }

    /** Adds k and returns what it cost, or 0 if k was already there. */
    public int insert(int k) {
        Integer at = table[slot(table, k)];
        if (at != null && at == k) return 0;
        int cost = 1;
        if ((double) (n + 1) / table.length > MAX_LOAD) {
            cost += rehash(nextPrime(2 * table.length));
        }
        table[slot(table, k)] = k;
        n++;
        total += cost;
        return cost;
    }

    private int rehash(int size) {
        Integer[] old = table;
        table = new Integer[size];
        for (Integer x : old) {
            if (x != null) table[slot(table, x)] = x;
        }
        return n; // every key moved
    }

    /** The slot that holds k, or -1. */
    public int search(int k) {
        int j = slot(table, k);
        return table[j] != null && table[j] == k ? j : -1;
    }

    public int capacity() {
        return table.length;
    }

    public long total() {
        return total;
    }

    /** The slots as text: keys, or - when empty. */
    public String show() {
        StringBuilder sb = new StringBuilder();
        for (int j = 0; j < table.length; j++) {
            if (j > 0) sb.append(' ');
            sb.append(table[j] == null ? "-" : table[j].toString());
        }
        return sb.toString();
    }

    static boolean isPrime(int n) {
        if (n < 2) return false;
        for (int d = 2; d * d <= n; d++) {
            if (n % d == 0) return false;
        }
        return true;
    }

    static int nextPrime(int n) {
        while (!isPrime(n)) n++;
        return n;
    }
}
