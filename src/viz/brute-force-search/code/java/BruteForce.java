import java.util.ArrayList;
import java.util.List;

/**
 * Brute-force string search: put the pattern at every shift s and compare it with the text
 * from left to right, stopping at the first mismatch.
 */
public final class BruteForce {
    private BruteForce() {}

    /** Returns every shift s where pattern occurs in text. */
    public static List<Integer> search(String text, String pattern) {
        int n = text.length();
        int m = pattern.length();
        List<Integer> found = new ArrayList<>();
        for (int s = 0; s <= n - m; s++) {
            int j = 0;
            while (j < m && text.charAt(s + j) == pattern.charAt(j)) {
                j++;
            }
            if (j == m) {
                found.add(s);
            }
        }
        return found;
    }
}
