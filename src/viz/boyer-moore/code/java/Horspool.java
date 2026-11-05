import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Boyer-Moore-Horspool: compare from the right end of the pattern, and after each alignment
 * slide by the table entry for the text character under the pattern's last position. The table
 * covers the 256 one-byte characters; use a Map for a bigger alphabet.
 */
public final class Horspool {
    private Horspool() {}

    /** shift[c]: how far to slide when c is under the pattern's last position. */
    public static int[] shiftTable(String pattern) {
        int m = pattern.length();
        int[] shift = new int[256];
        Arrays.fill(shift, m);
        for (int j = 0; j < m - 1; j++) {
            shift[pattern.charAt(j)] = m - 1 - j; // later characters overwrite earlier ones
        }
        return shift;
    }

    /** Returns every shift s where pattern occurs in text. */
    public static List<Integer> search(String text, String pattern) {
        int n = text.length();
        int m = pattern.length();
        int[] shift = shiftTable(pattern);
        List<Integer> found = new ArrayList<>();
        int s = 0;
        while (s <= n - m) {
            int j = m - 1;
            while (j >= 0 && text.charAt(s + j) == pattern.charAt(j)) {
                j--;
            }
            if (j < 0) {
                found.add(s);
            }
            s += shift[text.charAt(s + m - 1)];
        }
        return found;
    }
}
