/** Longest common subsequence: fill the table, then trace back one LCS. */
public class Lcs {
    /** c[i][j] is the length of an LCS of x[0..i) and y[0..j). */
    public static int[][] table(String x, String y) {
        int m = x.length();
        int n = y.length();
        int[][] c = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (x.charAt(i - 1) == y.charAt(j - 1)) {
                    c[i][j] = c[i - 1][j - 1] + 1;
                } else {
                    c[i][j] = Math.max(c[i - 1][j], c[i][j - 1]);
                }
            }
        }
        return c;
    }

    /** One longest common subsequence of x and y. On a tie the walk goes up, as in CLRS. */
    public static String lcs(String x, String y) {
        int[][] c = table(x, y);
        int i = x.length();
        int j = y.length();
        StringBuilder taken = new StringBuilder();
        while (i > 0 && j > 0) {
            if (x.charAt(i - 1) == y.charAt(j - 1)) {
                taken.append(x.charAt(i - 1));
                i--;
                j--;
            } else if (c[i - 1][j] >= c[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        return taken.reverse().toString();
    }
}
