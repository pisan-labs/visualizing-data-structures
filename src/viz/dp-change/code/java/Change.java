import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Making change with dynamic programming: the fewest coins, and the number of ways. */
public class Change {
    private static final int NONE = Integer.MAX_VALUE;

    /** The coins that pay amount with as few as possible, or null if it cannot be paid. */
    public static List<Integer> fewestCoins(int[] coins, int amount) {
        int[] sorted = coins.clone();
        Arrays.sort(sorted);
        int[] best = new int[amount + 1]; // best[a]: the fewest coins that make a
        int[] last = new int[amount + 1]; // last[a]: the coin best[a] used last
        Arrays.fill(best, 1, amount + 1, NONE);
        for (int a = 1; a <= amount; a++) {
            for (int c : sorted) {
                if (c <= a && best[a - c] != NONE && best[a - c] + 1 < best[a]) {
                    best[a] = best[a - c] + 1;
                    last[a] = c;
                }
            }
        }
        if (best[amount] == NONE) {
            return null;
        }
        List<Integer> paid = new ArrayList<>();
        for (int a = amount; a > 0; a -= last[a]) {
            paid.add(last[a]);
        }
        return paid;
    }

    /** How many ways there are to make amount, ignoring the order of the coins. */
    public static long countWays(int[] coins, int amount) {
        int[] sorted = coins.clone();
        Arrays.sort(sorted);
        long[] ways = new long[amount + 1]; // one row of the table, updated one coin at a time
        ways[0] = 1;
        for (int c : sorted) {
            for (int a = c; a <= amount; a++) {
                ways[a] += ways[a - c];
            }
        }
        return ways[amount];
    }
}
