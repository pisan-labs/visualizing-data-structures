/** h(s) = s[0]*b^(m-1) + s[1]*b^(m-2) + ... + s[m-1], mod p, for every prefix of s. */
public final class StringHash {
    final long p;
    final long[] h; // h[k] = hash of s[0..k-1]
    final long[] pw; // pw[k] = b^k mod p

    /** a = 1, b = 2, ..., z = 26 (not 0, or "b" and "ab" would collide). */
    static int val(char c) {
        return c - 'a' + 1;
    }

    public StringHash(String s, long b, long p) {
        this.p = p;
        h = new long[s.length() + 1];
        pw = new long[s.length() + 1];
        pw[0] = 1;
        for (int i = 0; i < s.length(); i++) {
            h[i + 1] = (h[i] * b + val(s.charAt(i))) % p;
            pw[i + 1] = pw[i] * b % p;
        }
    }

    /** Hash of s[l..r], inclusive, in O(1). */
    public long get(int l, int r) {
        return Math.floorMod(h[r + 1] - h[l] * pw[r - l + 1], p);
    }

    /** The hash of every window of k characters, each rolled from the one before. */
    public static long[] windowHashes(String s, int k, long b, long p) {
        long top = 1; // the weight of a window's first character, b^(k-1) mod p
        for (int i = 1; i < k; i++) top = top * b % p;
        long[] out = new long[s.length() - k + 1];
        long h = 0;
        for (int i = 0; i < k; i++) h = (h * b + val(s.charAt(i))) % p;
        out[0] = h;
        for (int i = k; i < s.length(); i++) {
            h = Math.floorMod((h - val(s.charAt(i - k)) * top) * b + val(s.charAt(i)), p);
            out[i - k + 1] = h;
        }
        return out;
    }
}
