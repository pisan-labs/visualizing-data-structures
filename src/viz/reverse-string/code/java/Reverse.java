/** Reversing a string recursively, two ways. */
public class Reverse {
    /** The reverse of s: reverse everything after the first character, then add it. */
    public static String reverse(String s) {
        if (s.length() <= 1) {
            return s;
        }
        return reverse(s.substring(1)) + s.charAt(0);
    }

    /** Reverse a between indices i and j by swapping the ends, then the inside. */
    public static void reverseInPlace(char[] a, int i, int j) {
        if (i >= j) {
            return;
        }
        char t = a[i];
        a[i] = a[j];
        a[j] = t;
        reverseInPlace(a, i + 1, j - 1);
    }
}
