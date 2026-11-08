import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class SubsetSum {
    /** reach[i][t] is true when some of the first i numbers add up to exactly t. */
    public static boolean[][] table(int[] xs, int target) {
        int n = xs.length;
        boolean[][] reach = new boolean[n + 1][target + 1];
        reach[0][0] = true;
        for (int i = 1; i <= n; i++) {
            int x = xs[i - 1];
            for (int t = 0; t <= target; t++) {
                reach[i][t] = reach[i - 1][t] || (x <= t && reach[i - 1][t - x]);
            }
        }
        return reach;
    }

    /** Numbers from xs that add up to target, in their order, or null if there are none. */
    public static List<Integer> subset(int[] xs, int target) {
        boolean[][] reach = table(xs, target);
        if (!reach[xs.length][target]) {
            return null;
        }
        List<Integer> taken = new ArrayList<>();
        int t = target;
        for (int i = xs.length; i >= 1; i--) {
            if (!reach[i - 1][t]) {
                taken.add(xs[i - 1]);
                t -= xs[i - 1];
            }
        }
        Collections.reverse(taken);
        return taken;
    }
}
