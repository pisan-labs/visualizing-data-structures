import java.util.Arrays;

/** Open addressing with linear probing. A deleted slot keeps a tombstone. */
public class LinearProbingTable {
    private enum State { EMPTY, FULL, DELETED }

    private final int[] keys;
    private final State[] state;
    private int n = 0;
    private int probes = 0; // probes used by the last operation

    public LinearProbingTable(int m) {
        keys = new int[m];
        state = new State[m];
        Arrays.fill(state, State.EMPTY);
    }

    private int h(int k, int i) {
        return (k % keys.length + i) % keys.length;
    }

    /** Adds k and returns true, or returns false if k is already there. */
    public boolean insert(int k) {
        int d = -1; // the first tombstone seen
        for (int i = 0; i < keys.length; i++) {
            probes = i + 1;
            int j = h(k, i);
            if (state[j] == State.EMPTY) {
                store(d >= 0 ? d : j, k);
                return true;
            }
            if (state[j] == State.DELETED) {
                if (d < 0) d = j;
            } else if (keys[j] == k) {
                return false;
            }
        }
        if (d >= 0) {
            store(d, k);
            return true;
        }
        throw new IllegalStateException("no free slot");
    }

    private void store(int j, int k) {
        keys[j] = k;
        state[j] = State.FULL;
        n++;
    }

    /** The slot that holds k, or -1. */
    public int search(int k) {
        for (int i = 0; i < keys.length; i++) {
            probes = i + 1;
            int j = h(k, i);
            if (state[j] == State.EMPTY) return -1;
            if (state[j] == State.FULL && keys[j] == k) return j;
        }
        return -1;
    }

    public boolean delete(int k) {
        int j = search(k);
        if (j < 0) return false;
        state[j] = State.DELETED;
        n--;
        return true;
    }

    public void clear() {
        Arrays.fill(state, State.EMPTY);
        n = 0;
    }

    public double loadFactor() {
        return (double) n / keys.length;
    }

    public int probes() {
        return probes;
    }

    public int size() {
        return keys.length;
    }

    /** Slot j as text: its key, DEL, or - when empty. */
    public String show(int j) {
        return switch (state[j]) {
            case EMPTY -> "-";
            case DELETED -> "DEL";
            case FULL -> String.valueOf(keys[j]);
        };
    }
}
