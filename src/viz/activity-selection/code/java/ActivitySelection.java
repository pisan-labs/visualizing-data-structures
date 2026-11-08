import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.stream.IntStream;

public class ActivitySelection {
    /**
     * The most activities that do not overlap, by earliest finish first. Activity k runs over
     * [start[k], finish[k]). Returns their numbers (from 1) in the order they are chosen.
     */
    public static List<Integer> select(int[] start, int[] finish) {
        Integer[] order = IntStream.range(0, start.length).boxed().toArray(Integer[]::new);
        Arrays.sort(order, Comparator.comparingInt(k -> finish[k])); // stable
        List<Integer> chosen = new ArrayList<>();
        int last = Integer.MIN_VALUE;
        for (int k : order) {
            if (start[k] >= last) {
                chosen.add(k + 1);
                last = finish[k];
            }
        }
        return chosen;
    }
}
