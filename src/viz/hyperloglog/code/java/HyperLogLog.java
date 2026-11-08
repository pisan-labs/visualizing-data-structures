/** m = 2^b registers; each keeps the largest rho seen. */
public class HyperLogLog {
    private static final int BITS = 16; // hash width

    private final int b;
    private final int m;
    private final int[] regs;

    public HyperLogLog(int b) {
        this.b = b;
        this.m = 1 << b;
        this.regs = new int[m];
    }

    public int indexBits() {
        return b;
    }

    /** MurmurHash3's 32-bit finalizer, keeping the top 16 bits. */
    static int hash16(int x) {
        int h = x;
        h ^= h >>> 16;
        h *= 0x85ebca6b;
        h ^= h >>> 13;
        h *= 0xc2b2ae35;
        h ^= h >>> 16;
        return h >>> 16;
    }

    /** Adds x and returns {register, rho}. */
    public int[] add(int x) {
        int h = hash16(x);
        int rest = BITS - b;
        int j = h >>> rest; // the first b bits pick the register
        int w = h & ((1 << rest) - 1);
        int rho = Integer.numberOfLeadingZeros(w) - (32 - rest) + 1;
        regs[j] = Math.max(regs[j], rho);
        return new int[] {j, rho};
    }

    public double estimate() {
        double alpha = m == 16 ? 0.673 : m == 32 ? 0.697 : m == 64 ? 0.709 : 0.7213 / (1 + 1.079 / m);
        double z = 0;
        int zeros = 0;
        for (int v : regs) {
            z += Math.pow(2, -v);
            if (v == 0) zeros++;
        }
        double e = alpha * m * m / z;
        if (e <= 2.5 * m && zeros > 0) e = m * Math.log((double) m / zeros); // small-range correction
        return e;
    }
}
