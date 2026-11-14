import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: "single v ...", "missing v ..." and "two v ..." print the answer (the two
 * singles smaller first); "swap i j v ..." prints the list after swapping.
 */
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        for (String line; (line = in.readLine()) != null; ) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            int[] nums = new int[p.length - 1];
            for (int k = 1; k < p.length; k++) nums[k - 1] = Integer.parseInt(p[k]);
            switch (p[0]) {
                case "single" -> out.append(XorTricks.single(nums)).append('\n');
                case "missing" -> out.append(XorTricks.missing(nums)).append('\n');
                case "two" -> {
                    int[] ab = XorTricks.twoSingles(nums);
                    out.append(ab[0]).append(' ').append(ab[1]).append('\n');
                }
                case "swap" -> {
                    int[] values = java.util.Arrays.copyOfRange(nums, 2, nums.length);
                    XorTricks.swap(values, nums[0], nums[1]);
                    StringJoiner j = new StringJoiner(" ");
                    for (int v : values) j.add(String.valueOf(v));
                    out.append(j).append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}
