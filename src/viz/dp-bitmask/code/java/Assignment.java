public class Assignment {
    /**
     * cost[w][t]: what worker w charges for task t, n x n. Returns {total, task of worker 0,
     * task of worker 1, ...}.
     */
    public static int[] cheapest(int[][] cost) {
        int n = cost.length;
        int full = (1 << n) - 1;
        int[] f = new int[1 << n]; // f[mask]: cheapest way to give mask's tasks to the first workers
        int[] last = new int[1 << n]; // the task the last of those workers takes in that way
        java.util.Arrays.fill(f, Integer.MAX_VALUE);
        f[0] = 0;
        for (int mask = 1; mask <= full; mask++) { // mask minus a task is smaller: already done
            int k = Integer.bitCount(mask); // k tasks go to workers 0..k-1
            for (int t = 0; t < n; t++) {
                if ((mask >> t & 1) == 0) continue;
                int c = f[mask ^ (1 << t)] + cost[k - 1][t]; // worker k-1 takes task t last
                if (c < f[mask]) {
                    f[mask] = c;
                    last[mask] = t;
                }
            }
        }
        int[] out = new int[n + 1];
        out[0] = f[full];
        for (int w = n - 1, mask = full; w >= 0; w--) { // walk back from the full mask
            out[w + 1] = last[mask];
            mask ^= 1 << last[mask];
        }
        return out;
    }
}
