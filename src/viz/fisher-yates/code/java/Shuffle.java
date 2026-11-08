import java.util.function.IntBinaryOperator;

public class Shuffle {
    /** Shuffle a in place (Fisher-Yates). randInt(lo, hi) returns a random int in [lo, hi]. */
    public static <T> void shuffle(T[] a, IntBinaryOperator randInt) {
        int n = a.length;
        for (int i = 0; i < n - 1; i++) {
            int j = randInt.applyAsInt(i, n - 1); // from the unshuffled part, i included
            T t = a[i];
            a[i] = a[j];
            a[j] = t;
        }
    }
}
