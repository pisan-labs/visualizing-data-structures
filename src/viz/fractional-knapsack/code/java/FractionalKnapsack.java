import java.util.Arrays;
import java.util.stream.IntStream;

public class FractionalKnapsack {
    /**
     * The most value that fits in capacity W when items can be cut. Returns it as a fraction
     * {numerator, denominator} in lowest terms.
     */
    public static long[] best(int[] w, int[] v, int capacity) {
        Integer[] order = IntStream.range(0, w.length).boxed().toArray(Integer[]::new);
        // Best value per weight first: v[a]/w[a] > v[b]/w[b] without dividing. Stable for ties.
        Arrays.sort(order, (a, b) -> Long.compare((long) v[b] * w[a], (long) v[a] * w[b]));
        long num = 0;
        long den = 1;
        int left = capacity;
        for (int i : order) {
            if (left == 0) {
                break;
            }
            int part = Math.min(w[i], left); // all of it, or the part that fits
            num = num * w[i] + (long) v[i] * part * den;
            den *= w[i];
            long g = gcd(num, den);
            num /= g;
            den /= g;
            left -= part;
        }
        return new long[] {num, den};
    }

    private static long gcd(long a, long b) {
        return b == 0 ? Math.max(a, 1) : gcd(b, a % b);
    }
}
