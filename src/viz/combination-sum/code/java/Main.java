import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: "again t v1 v2 ..." (each candidate as often as you like) or "once t v1 v2 ..."
 * (each at most once) prints every combination that sums to t, in the order found, such as
 * "[3,3,4] [3,7] [5,5]", or "none".
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 2) continue;
            int target = Integer.parseInt(p[1]);
            int[] values = new int[p.length - 2];
            for (int i = 2; i < p.length; i++) values[i - 2] = Integer.parseInt(p[i]);
            List<List<Integer>> found = CombinationSum.combinationSum(values, target, p[0].equals("again"));
            StringJoiner text = new StringJoiner(" ");
            for (List<Integer> combo : found) {
                StringJoiner one = new StringJoiner(",", "[", "]");
                for (int x : combo) one.add(String.valueOf(x));
                text.add(one.toString());
            }
            System.out.println(found.isEmpty() ? "none" : text.toString());
        }
    }
}
