import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The Burrows-Wheeler transform: sort every rotation of text + "$" and read the last column. The
 * inverse needs only that column: the k-th copy of a character in L is the k-th copy in F.
 */
public final class Bwt {
    private Bwt() {}

    private static String rotation(String s, int k) {
        return s.substring(k) + s.substring(0, k);
    }

    /** Rotation starts in sorted order; ties keep their order. */
    private static List<Integer> sortedRotations(String s) {
        List<Integer> rows = new ArrayList<>();
        for (int k = 0; k < s.length(); k++) {
            rows.add(k);
        }
        rows.sort((a, b) -> rotation(s, a).compareTo(rotation(s, b)));
        return rows;
    }

    private static String lastColumn(String s, List<Integer> rows) {
        StringBuilder last = new StringBuilder();
        for (int k : rows) {
            last.append(s.charAt((k + s.length() - 1) % s.length()));
        }
        return last.toString();
    }

    /** The last column of the sorted rotations of text + '$'. */
    public static String transform(String text) {
        String s = text + "$";
        return lastColumn(s, sortedRotations(s));
    }

    /** lf[r]: the row of F holding the same copy of the character last[r]. */
    public static int[] lfMapping(String last) {
        char[] first = last.toCharArray();
        Arrays.sort(first);
        Map<Character, Integer> start = new HashMap<>();
        for (int r = first.length - 1; r >= 0; r--) {
            start.put(first[r], r);
        }
        Map<Character, Integer> seen = new HashMap<>();
        int[] lf = new int[last.length()];
        for (int r = 0; r < last.length(); r++) {
            char c = last.charAt(r);
            int k = seen.getOrDefault(c, 0);
            lf[r] = start.get(c) + k;
            seen.put(c, k + 1);
        }
        return lf;
    }

    private static String walk(String last, int row, int steps) {
        int[] lf = lfMapping(last);
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < steps; i++) {
            text.append(last.charAt(row)); // last[row] comes just before first[row]
            row = lf[row];
        }
        return text.reverse().toString();
    }

    /** The text whose transform is last (which holds one '$'): start at the row "$" + text. */
    public static String inverse(String last) {
        return walk(last, 0, last.length() - 1);
    }

    /** Without an end marker: the last column, then the row of text. */
    public static String[] transformIndex(String text) {
        List<Integer> rows = sortedRotations(text);
        return new String[] {lastColumn(text, rows), String.valueOf(rows.indexOf(0))};
    }

    public static String inverseIndex(String last, int index) {
        return walk(last, index, last.length());
    }
}
