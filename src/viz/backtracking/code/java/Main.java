import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: "subsets 1 2 3", "target 5 1 2 3 4" or "permutations 1 2 3", one per line.
 * Prints the outputs in the order the search finds them, such as "[1,2] [1] [2] []".
 */
public class Main {
    static String show(List<List<Integer>> lists) {
        StringJoiner line = new StringJoiner(" ");
        for (List<Integer> xs : lists) {
            StringJoiner one = new StringJoiner(",", "[", "]");
            for (int v : xs) one.add(String.valueOf(v));
            line.add(one.toString());
        }
        return line.toString();
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int[] nums = Arrays.stream(parts).skip(1).mapToInt(Integer::parseInt).toArray();
            String result = switch (parts[0]) {
                case "subsets" -> show(Backtracking.subsets(nums, null));
                case "target" -> show(Backtracking.subsets(Arrays.copyOfRange(nums, 1, nums.length), nums[0]));
                case "permutations" -> show(Backtracking.permutations(nums));
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            };
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}
