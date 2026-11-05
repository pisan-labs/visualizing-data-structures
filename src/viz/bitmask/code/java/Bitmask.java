import java.util.ArrayList;
import java.util.List;

/** A set of small integers stored as the bits of one int: bit i is 1 when i is in the set. */
public class Bitmask {
    public static int setBit(int x, int i) {
        return x | (1 << i);
    }

    public static int clearBit(int x, int i) {
        return x & ~(1 << i);
    }

    public static int toggleBit(int x, int i) {
        return x ^ (1 << i);
    }

    public static int testBit(int x, int i) {
        return (x >> i) & 1;
    }

    public static int lowestBit(int x) {
        return x & -x;
    }

    public static int popcount(int x) {
        int count = 0;
        while (x != 0) {
            x = x & (x - 1); // clear the lowest 1
            count++;
        }
        return count;
    }

    /** Every subset of {0, ..., n - 1}, as masks from 0 to 2^n - 1. */
    public static List<Integer> subsets(int n) {
        List<Integer> out = new ArrayList<>();
        for (int mask = 0; mask < (1 << n); mask++) {
            out.add(mask);
        }
        return out;
    }

    /** Every subset of x, from x itself down to 0. */
    public static List<Integer> submasks(int x) {
        List<Integer> out = new ArrayList<>();
        int sub = x;
        while (true) {
            out.add(sub);
            if (sub == 0) {
                return out;
            }
            sub = (sub - 1) & x;
        }
    }
}
