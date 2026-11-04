/** Edit distance (Levenshtein) with costs for insert, delete and substitute. */
public class EditDistance {
    /** d[i][j] is the cheapest way to turn a[0..i) into b[0..j). */
    public static int[][] table(String a, String b, int ins, int del, int sub) {
        int m = a.length();
        int n = b.length();
        int[][] d = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) {
            d[i][0] = i * del;
        }
        for (int j = 0; j <= n; j++) {
            d[0][j] = j * ins;
        }
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : sub;
                d[i][j] = Math.min(d[i - 1][j - 1] + cost, Math.min(d[i - 1][j] + del, d[i][j - 1] + ins));
            }
        }
        return d;
    }

    public static int distance(String a, String b, int ins, int del, int sub) {
        return table(a, b, ins, del, sub)[a.length()][b.length()];
    }

    /** The edits from left to right: M match, S substitute, D delete, I insert. */
    public static String alignment(String a, String b, int ins, int del, int sub) {
        int[][] d = table(a, b, ins, del, sub);
        int i = a.length();
        int j = b.length();
        StringBuilder ops = new StringBuilder();
        while (i > 0 || j > 0) {
            boolean same = i > 0 && j > 0 && a.charAt(i - 1) == b.charAt(j - 1);
            if (i > 0 && j > 0 && d[i][j] == d[i - 1][j - 1] + (same ? 0 : sub)) {
                ops.append(same ? 'M' : 'S');
                i--;
                j--;
            } else if (i > 0 && d[i][j] == d[i - 1][j] + del) {
                ops.append('D');
                i--;
            } else {
                ops.append('I');
                j--;
            }
        }
        return ops.reverse().toString();
    }
}
