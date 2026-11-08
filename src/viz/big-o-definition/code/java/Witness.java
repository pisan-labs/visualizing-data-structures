import java.util.function.LongUnaryOperator;

/**
 * f(n) = O(g(n)) when 0 <= f(n) <= c * g(n) for every n >= n0, for some c > 0 and n0.
 * A program can only try a finite range of n. These check a witness (c, n0) up to nMax and
 * find the smallest n0 for a c. c = cNum / cDen, compared without dividing.
 */
public class Witness {
    /** The floor of log2 n: how many times n halves before it reaches 1. */
    public static long lg(long n) {
        long k = 0;
        while (n > 1) {
            n /= 2;
            k++;
        }
        return k;
    }

    static boolean holds(LongUnaryOperator f, LongUnaryOperator g, long cNum, long cDen, long n) {
        long fn = f.applyAsLong(n);
        return fn >= 0 && fn * cDen <= cNum * g.applyAsLong(n);
    }

    /** The first n from n0 to nMax that breaks it, or -1 if none does. */
    public static long firstFailure(
            LongUnaryOperator f, LongUnaryOperator g, long cNum, long cDen, long n0, long nMax) {
        for (long n = n0; n <= nMax; n++) {
            if (!holds(f, g, cNum, cDen, n)) return n;
        }
        return -1;
    }

    /** The smallest n0 with nothing breaking it up to nMax (one past the last failure), or -1. */
    public static long smallestN0(
            LongUnaryOperator f, LongUnaryOperator g, long cNum, long cDen, long nMax) {
        for (long n = nMax; n >= 1; n--) {
            if (!holds(f, g, cNum, cDen, n)) return n < nMax ? n + 1 : -1;
        }
        return 1;
    }
}
