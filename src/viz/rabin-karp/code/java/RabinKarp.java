import java.util.ArrayList;
import java.util.List;

/**
 * Rabin-Karp: compare a rolling hash of each window with the pattern's hash, and compare
 * characters only when the hashes agree. Digits use d = 10 (each character is its digit); other
 * text uses d = 256 (each character is its code). q = 13, as in the visualization's default.
 */
public final class RabinKarp {
    private RabinKarp() {}

    public static List<Integer> search(String text, String pattern) {
        return search(text, pattern, 13);
    }

    /** Returns every shift s where pattern occurs in text. */
    public static List<Integer> search(String text, String pattern, int q) {
        int n = text.length();
        int m = pattern.length();
        List<Integer> found = new ArrayList<>();
        if (m > n) {
            return found;
        }
        boolean digits = (text + pattern).chars().allMatch(Character::isDigit);
        int d = digits ? 10 : 256;
        long h = 1; // the weight of a window's first character: d^(m-1) mod q
        for (int k = 0; k < m - 1; k++) {
            h = h * d % q;
        }
        long p = 0;
        long t = 0;
        for (int i = 0; i < m; i++) {
            p = (d * p + value(pattern.charAt(i), digits)) % q;
            t = (d * t + value(text.charAt(i), digits)) % q;
        }
        for (int s = 0; s <= n - m; s++) {
            if (p == t && text.startsWith(pattern, s)) { // a hit, checked
                found.add(s);
            }
            if (s < n - m) { // roll: drop text[s], bring in text[s + m]
                t = (d * (t - value(text.charAt(s), digits) * h) + value(text.charAt(s + m), digits)) % q;
                if (t < 0) {
                    t += q; // Java's % can be negative
                }
            }
        }
        return found;
    }

    private static int value(char c, boolean digits) {
        return digits ? c - '0' : c;
    }
}
