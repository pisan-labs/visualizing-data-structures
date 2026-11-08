public class Euclid {
    /** gcd(a, b) for a, b >= 0: replace (a, b) with (b, a mod b) until b is 0. */
    public static long euclid(long a, long b) {
        if (b == 0) return a;
        return euclid(b, a % b);
    }

    /** {d, x, y} with d = gcd(a, b) = a*x + b*y. */
    public static long[] extendedEuclid(long a, long b) {
        if (b == 0) return new long[] {a, 1, 0};
        long[] r = extendedEuclid(b, a % b);
        return new long[] {r[0], r[2], r[1] - (a / b) * r[2]};
    }

    /** The x in 0..m-1 with a*x = 1 (mod m), or -1 when gcd(a, m) is not 1. */
    public static long modInverse(long a, long m) {
        long[] r = extendedEuclid(a, m);
        if (r[0] != 1) return -1;
        return ((r[1] % m) + m) % m;
    }
}
