/** Ring all-reduce over n workers; v[i] is worker i's vector, cut into n chunks. */
public class RingAllReduce {
    /**
     * In step t every worker i sends chunk (i - t) mod n to worker i + 1, which adds it to its
     * own. All sends in a step happen at once. Afterwards worker i holds the whole sum of chunk
     * (i + 1) mod n.
     */
    static void reduceScatter(long[][] v) {
        int n = v.length;
        for (int t = 0; t < n - 1; t++) {
            long[] sent = new long[n];
            for (int i = 0; i < n; i++) sent[i] = v[i][Math.floorMod(i - t, n)];
            for (int i = 0; i < n; i++) v[(i + 1) % n][Math.floorMod(i - t, n)] += sent[i];
        }
    }

    /** After reduceScatter: pass each finished chunk once round the ring. */
    static void allGather(long[][] v) {
        int n = v.length;
        for (int t = 0; t < n - 1; t++) {
            long[] sent = new long[n];
            for (int i = 0; i < n; i++) sent[i] = v[i][Math.floorMod(i + 1 - t, n)];
            for (int i = 0; i < n; i++) v[(i + 1) % n][Math.floorMod(i + 1 - t, n)] = sent[i];
        }
    }

    /** Every worker ends with the sum; each sends 2(n - 1) chunks, 2(n - 1)/n of a vector. */
    static void ringAllReduce(long[][] v) {
        reduceScatter(v);
        allGather(v);
    }
}
