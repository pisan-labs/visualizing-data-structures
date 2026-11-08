/**
 * m bits and k hash functions h_i(x) = ((A[i]*x + B[i]) mod P) mod m. There is no delete: a
 * bit may belong to several keys.
 */
public class BloomFilter {
    private static final int P = 1009; // a prime larger than every key
    private static final int[] A = {71, 113, 157, 211, 263, 307};
    private static final int[] B = {5, 17, 29, 43, 61, 83};

    private final int m;
    private final int k;
    private boolean[] bits;

    public BloomFilter(int m, int k) {
        this.m = m;
        this.k = k;
        this.bits = new boolean[m];
    }

    public int[] positions(int x) {
        int[] js = new int[k];
        for (int i = 0; i < k; i++) js[i] = (A[i] * x + B[i]) % P % m;
        return js;
    }

    public void insert(int x) {
        for (int j : positions(x)) bits[j] = true;
    }

    /** False: x was never inserted. True: x was probably inserted. */
    public boolean query(int x) {
        for (int j : positions(x)) {
            if (!bits[j]) return false;
        }
        return true;
    }

    public void clear() {
        bits = new boolean[m];
    }
}
