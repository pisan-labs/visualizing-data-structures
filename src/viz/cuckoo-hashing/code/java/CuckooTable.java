import java.util.ArrayList;
import java.util.List;

/** Two tables of m slots: key k lives in t[0][k mod m] or in t[1][(k div m) mod m]. */
public class CuckooTable {
    private static final int EMPTY = -1;

    private int m;
    private int[][] t;
    private int kicks; // kicks in the last insert, before any rehash
    private int rehashes;

    public CuckooTable(int m) {
        this.m = m;
        clear();
    }

    public int size() { return m; }
    public int kicks() { return kicks; }
    public int rehashes() { return rehashes; }
    public int at(int i, int j) { return t[i][j]; }

    private int h(int i, int k) {
        return i == 0 ? k % m : (k / m) % m;
    }

    /** 1 or 2, the table that holds k, or 0. Two probes at most. */
    public int search(int k) {
        for (int i = 0; i < 2; i++) {
            if (t[i][h(i, k)] == k) return i + 1;
        }
        return 0;
    }

    public boolean insert(int k) {
        if (search(k) != 0) return false;
        kicks = 0;
        int left = walk(k, true);
        if (left != EMPTY) rehash(left);
        return true;
    }

    public boolean delete(int k) {
        for (int i = 0; i < 2; i++) {
            int j = h(i, k);
            if (t[i][j] == k) {
                t[i][j] = EMPTY;
                return true;
            }
        }
        return false;
    }

    public void clear() {
        t = new int[2][m];
        for (int[] row : t) java.util.Arrays.fill(row, EMPTY);
    }

    /**
     * Puts k in its T1 nest, kicking each old key to its other nest. Returns the key left
     * homeless when the kicks would go round forever, or EMPTY.
     */
    private int walk(int k, boolean count) {
        int x = k, i = 0, homeless = 1;
        while (true) {
            int j = h(i, x);
            int old = t[i][j];
            t[i][j] = x;
            if (old == EMPTY) return EMPTY;
            if (count) kicks++;
            if (old == k && ++homeless == 3) return old; // k kicked out twice: a cycle
            x = old;
            i = 1 - i;
        }
    }

    private void rehash(int left) {
        List<Integer> keys = new ArrayList<>();
        for (int[] row : t) {
            for (int x : row) if (x != EMPTY) keys.add(x);
        }
        keys.add(left);
        boolean done = false;
        while (!done) {
            m = nextPrime(m + 1); // new m: new hash functions
            rehashes++;
            clear();
            done = true;
            for (int x : keys) {
                if (walk(x, false) != EMPTY) {
                    done = false;
                    break;
                }
            }
        }
    }

    private static int nextPrime(int n) {
        for (;; n++) {
            boolean prime = n >= 2;
            for (int d = 2; d * d <= n && prime; d++) prime = n % d != 0;
            if (prime) return n;
        }
    }
}
