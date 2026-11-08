import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;

/**
 * Test driver: "table a1 a2 ..." (the O(n^2) method) or "tails a1 a2 ..." (binary search) prints
 * the length of a longest increasing subsequence and the subsequence itself.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 2) {
                continue;
            }
            int[] a = new int[p.length - 1];
            for (int k = 0; k < a.length; k++) {
                a[k] = Integer.parseInt(p[k + 1]);
            }
            List<Integer> seq = p[0].equals("table") ? Lis.table(a) : Lis.tails(a);
            out.append(seq.size());
            for (int v : seq) {
                out.append(' ').append(v);
            }
            out.append('\n');
        }
        System.out.print(out);
    }
}
