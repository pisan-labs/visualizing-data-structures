public class Palindrome {
    /** L[i][j] is the length of the longest palindromic subsequence of s[i..j]. */
    public static int[][] table(String s) {
        int n = s.length();
        int[][] L = new int[n][n];
        for (int i = 0; i < n; i++) {
            L[i][i] = 1;
        }
        for (int len = 2; len <= n; len++) {
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                if (s.charAt(i) == s.charAt(j)) {
                    L[i][j] = (len > 2 ? L[i + 1][j - 1] : 0) + 2;
                } else {
                    L[i][j] = Math.max(L[i + 1][j], L[i][j - 1]);
                }
            }
        }
        return L;
    }

    /** One longest palindromic subsequence, walking in from both ends. */
    public static String longest(String s) {
        int[][] L = table(s);
        StringBuilder left = new StringBuilder();
        StringBuilder right = new StringBuilder();
        int i = 0;
        int j = s.length() - 1;
        while (i <= j) {
            if (i == j) {
                left.append(s.charAt(i++)); // the middle
            } else if (s.charAt(i) == s.charAt(j)) {
                left.append(s.charAt(i++));
                right.append(s.charAt(j--));
            } else if (L[i + 1][j] >= L[i][j - 1]) {
                i++; // drop the left end
            } else {
                j--; // drop the right end
            }
        }
        return left.append(right.reverse()).toString();
    }
}
