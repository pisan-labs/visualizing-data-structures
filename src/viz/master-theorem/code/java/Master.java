/** The Master theorem for T(n) = a T(n/b) + n^d lg^k n, and the recurrence itself. */
public class Master {
    private static long power(long base, int exp) {
        long p = 1;
        for (int i = 0; i < exp; i++) {
            p *= base;
        }
        return p;
    }

    /** Which CLRS case applies: "1", "2", "3", or "none". */
    public static String masterCase(int a, int b, int d, int k) {
        // d against log_b a, compared without floating point: b^d against a.
        long bd = power(b, d);
        if (bd < a) {
            return "1"; // leaves dominate: Theta(n^(log_b a))
        }
        if (bd > a) {
            return "3"; // root dominates: Theta(f(n))
        }
        return k >= 0 ? "2" : "none"; // ties; k < 0 falls in the gap
    }

    /** T(1) = 1 and T(n) = a T(n/b) + n^d, for n a power of b. */
    public static long T(int a, int b, int d, long n) {
        if (n == 1) {
            return 1;
        }
        return a * T(a, b, d, n / b) + power(n, d);
    }
}
