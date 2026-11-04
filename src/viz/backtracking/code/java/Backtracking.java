import java.util.ArrayList;
import java.util.List;

/** Subsets and permutations by backtracking: choose, explore, unchoose. */
public class Backtracking {
    /**
     * Every subset of values, taking or skipping each value in turn. With a target (values
     * greater than 0; pass null for none), only the subsets with that sum, and branches that
     * cannot reach it are pruned.
     */
    public static List<List<Integer>> subsets(int[] values, Integer target) {
        List<List<Integer>> out = new ArrayList<>();
        int[] rest = new int[values.length + 1];
        for (int i = values.length - 1; i >= 0; i--) rest[i] = rest[i + 1] + values[i];
        subsets(values, target, rest, 0, 0, new ArrayList<>(), out);
        return out;
    }

    private static void subsets(int[] values, Integer target, int[] rest, int i, int total,
            List<Integer> chosen, List<List<Integer>> out) {
        if (target != null && (total > target || total + rest[i] < target)) {
            return; // prune: this branch cannot reach the target
        }
        if (i == values.length) {
            out.add(new ArrayList<>(chosen));
            return;
        }
        chosen.add(values[i]); // choose
        subsets(values, target, rest, i + 1, total + values[i], chosen, out); // explore
        chosen.remove(chosen.size() - 1); // unchoose
        subsets(values, target, rest, i + 1, total, chosen, out); // explore without it
    }

    /** Every order of values: choose an unused value, explore, unchoose. */
    public static List<List<Integer>> permutations(int[] values) {
        List<List<Integer>> out = new ArrayList<>();
        permute(values, new boolean[values.length], new ArrayList<>(), out);
        return out;
    }

    private static void permute(int[] values, boolean[] used, List<Integer> chosen,
            List<List<Integer>> out) {
        if (chosen.size() == values.length) {
            out.add(new ArrayList<>(chosen));
            return;
        }
        for (int k = 0; k < values.length; k++) {
            if (!used[k]) {
                used[k] = true;
                chosen.add(values[k]); // choose
                permute(values, used, chosen, out); // explore
                chosen.remove(chosen.size() - 1); // unchoose
                used[k] = false;
            }
        }
    }
}
