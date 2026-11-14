import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class CombinationSum {
    /**
     * Every combination of candidates that adds up to target, each a sorted list. reuse: a
     * candidate may be used again and again; otherwise each once (a value given twice may be
     * used twice).
     */
    public static List<List<Integer>> combinationSum(int[] candidates, int target, boolean reuse) {
        int[] c = reuse ? Arrays.stream(candidates).distinct().toArray() : candidates.clone();
        Arrays.sort(c);
        List<List<Integer>> out = new ArrayList<>();
        search(c, reuse, 0, target, new ArrayList<>(), out);
        return out;
    }

    private static void search(
            int[] c, boolean reuse, int start, int left, List<Integer> chosen, List<List<Integer>> out) {
        if (left == 0) {
            out.add(new ArrayList<>(chosen));
            return;
        }
        for (int i = start; i < c.length; i++) {
            if (!reuse && i > start && c[i] == c[i - 1]) continue; // the same value again here
            if (c[i] > left) break; // c is sorted, so every later candidate is bigger too
            chosen.add(c[i]);
            search(c, reuse, reuse ? i : i + 1, left - c[i], chosen, out);
            chosen.remove(chosen.size() - 1);
        }
    }
}
