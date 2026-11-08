/**
 * Manacher's algorithm. With a separator between the characters and at both ends, every
 * palindrome has a center cell, and p[i] is the radius of the longest palindrome centered at t[i]
 * (its length in s). c and r mark the palindrome that reaches furthest right: r = c + p[c].
 */
public final class Manacher {
    private Manacher() {}

    /** p[i] for every cell of t = "#" + s with '#' between characters + "#". */
    public static int[] radii(String s) {
        StringBuilder sb = new StringBuilder("#");
        for (char ch : s.toCharArray()) {
            sb.append(ch).append('#');
        }
        String t = sb.toString();
        int n = t.length();
        int[] p = new int[n];
        int c = 0;
        int r = 0;
        for (int i = 0; i < n; i++) {
            if (i < r) { // inside: copy the mirror's radius, cut off at r
                p[i] = Math.min(r - i, p[2 * c - i]);
            }
            while (i - p[i] - 1 >= 0 && i + p[i] + 1 < n
                    && t.charAt(i - p[i] - 1) == t.charAt(i + p[i] + 1)) {
                p[i]++;
            }
            if (i + p[i] > r) { // reaches further right: the new one to mirror
                c = i;
                r = i + p[i];
            }
        }
        return p;
    }

    /** The longest palindromic substring of s (the leftmost on ties). */
    public static String longestPalindrome(String s) {
        int[] p = radii(s);
        int best = 0;
        for (int i = 1; i < p.length; i++) {
            if (p[i] > p[best]) {
                best = i;
            }
        }
        int start = (best - p[best]) / 2;
        return s.substring(start, start + p[best]);
    }
}
