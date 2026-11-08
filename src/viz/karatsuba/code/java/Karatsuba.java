public class Karatsuba {
    /** Counts the calls, to compare with the call tree. */
    public static int calls = 0;

    /** x * y for x, y >= 0, with three recursive products per split instead of four. */
    public static long karatsuba(long x, long y) {
        calls++;
        if (x < 10 || y < 10) return x * y;
        int m = Math.max(Long.toString(x).length(), Long.toString(y).length()) / 2;
        long p = (long) Math.pow(10, m);
        long a = x / p, b = x % p; // x = a * 10^m + b
        long c = y / p, d = y % p; // y = c * 10^m + d
        long z2 = karatsuba(a, c);
        long z0 = karatsuba(b, d);
        long z1 = karatsuba(a + b, c + d) - z2 - z0; // = a*d + b*c
        return z2 * p * p + z1 * p + z0;
    }
}
