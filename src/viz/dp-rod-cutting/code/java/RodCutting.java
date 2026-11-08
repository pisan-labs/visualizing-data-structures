import java.util.ArrayList;
import java.util.List;

public class RodCutting {
    /**
     * Bottom-up: r[j] is the best revenue for length j and s[j] the first piece of a best cut.
     * p[i] is the price of a piece of length i (p[0] is unused). Returns {r, s}.
     */
    public static int[][] table(int[] p) {
        int n = p.length - 1;
        int[] r = new int[n + 1];
        int[] s = new int[n + 1];
        for (int j = 1; j <= n; j++) {
            int q = -1;
            for (int i = 1; i <= j; i++) {
                if (q < p[i] + r[j - i]) {
                    q = p[i] + r[j - i];
                    s[j] = i;
                }
            }
            r[j] = q;
        }
        return new int[][] {r, s};
    }

    /** The pieces of a best cut, first piece first. */
    public static List<Integer> pieces(int[] s, int n) {
        List<Integer> out = new ArrayList<>();
        while (n > 0) {
            out.add(s[n]);
            n -= s[n];
        }
        return out;
    }
}
