import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** The 0/1 knapsack: each item goes in whole or not at all. */
public class Knapsack {
    /** best[i][c] is the best value from the first i items with capacity c. */
    public static int[][] table(int[] weight, int[] value, int capacity) {
        int n = weight.length;
        int[][] best = new int[n + 1][capacity + 1];
        for (int i = 1; i <= n; i++) {
            for (int c = 0; c <= capacity; c++) {
                best[i][c] = best[i - 1][c]; // skip item i
                int w = weight[i - 1];
                if (w <= c && best[i - 1][c - w] + value[i - 1] > best[i][c]) {
                    best[i][c] = best[i - 1][c - w] + value[i - 1]; // take item i
                }
            }
        }
        return best;
    }

    /** The numbers (from 1) of the items in one best knapsack. */
    public static List<Integer> taken(int[] weight, int[] value, int capacity) {
        int[][] best = table(weight, value, capacity);
        List<Integer> taken = new ArrayList<>();
        int c = capacity;
        for (int i = weight.length; i >= 1; i--) {
            if (best[i][c] != best[i - 1][c]) {
                taken.add(i);
                c -= weight[i - 1];
            }
        }
        Collections.reverse(taken);
        return taken;
    }
}
