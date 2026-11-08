import java.util.ArrayList;
import java.util.List;

/**
 * The Z-algorithm. z[i] is the length of the longest substring starting at s[i] that is also a
 * prefix of s. The box [l, r] is the match that reaches furthest right so far.
 */
public final class ZAlgorithm {
    private ZAlgorithm() {}

    /** z[i] for every i; z[0] is left 0. */
    public static int[] zArray(String s) {
        int n = s.length();
        int[] z = new int[n];
        int l = 0;
        int r = 0;
        for (int i = 1; i < n; i++) {
            if (i <= r) { // inside the box: copy from the mirror, cut off at r
                z[i] = Math.min(r - i + 1, z[i - l]);
            }
            while (i + z[i] < n && s.charAt(z[i]) == s.charAt(i + z[i])) {
                z[i]++;
            }
            if (i + z[i] - 1 > r) { // reaches further right: the new box
                l = i;
                r = i + z[i] - 1;
            }
        }
        return z;
    }

    /** Every shift where pattern occurs in text, via z on pattern$text. */
    public static List<Integer> search(String text, String pattern) {
        int m = pattern.length();
        int[] z = zArray(pattern + "$" + text);
        List<Integer> found = new ArrayList<>();
        for (int i = m + 1; i < z.length; i++) {
            if (z[i] == m) {
                found.add(i - m - 1);
            }
        }
        return found;
    }
}
