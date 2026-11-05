import java.util.ArrayList;
import java.util.List;

/**
 * Knuth-Morris-Pratt. pi[j] is the length of the longest proper prefix of pattern[0..j] that is
 * also a suffix of it. After a mismatch the pattern slides so that border lines up with the
 * text it matched, and the text pointer s + q never moves back.
 */
public final class Kmp {
    private Kmp() {}

    /** pi[j] for every j: the longest border of p[0..j]. */
    public static int[] prefixFunction(String p) {
        int[] pi = new int[p.length()];
        int q = 0;
        for (int i = 1; i < p.length(); i++) {
            while (q > 0 && p.charAt(q) != p.charAt(i)) {
                q = pi[q - 1];
            }
            if (p.charAt(q) == p.charAt(i)) {
                q++;
            }
            pi[i] = q;
        }
        return pi;
    }

    /** Returns every shift s where pattern occurs in text. */
    public static List<Integer> search(String text, String pattern) {
        int n = text.length();
        int m = pattern.length();
        int[] pi = prefixFunction(pattern);
        List<Integer> found = new ArrayList<>();
        int s = 0;
        int q = 0; // at shift s, the first q characters are known to match
        while (s <= n - m) {
            while (q < m && text.charAt(s + q) == pattern.charAt(q)) {
                q++;
            }
            if (q == m) {
                found.add(s);
            }
            if (q == 0) {
                s++;
            } else {
                s += q - pi[q - 1];
                q = pi[q - 1];
            }
        }
        return found;
    }
}
