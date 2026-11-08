import java.util.ArrayList;
import java.util.List;
import java.util.function.IntBinaryOperator;

public class Reservoir {
    /**
     * A uniform sample of k items from a stream of unknown length (Algorithm R). randInt(lo, hi)
     * returns a random int in [lo, hi].
     */
    public static <T> List<T> sample(Iterable<T> stream, int k, IntBinaryOperator randInt) {
        List<T> reservoir = new ArrayList<>();
        int i = 0;
        for (T item : stream) {
            i++;
            if (i <= k) {
                reservoir.add(item); // the first k go straight in
            } else {
                int j = randInt.applyAsInt(1, i);
                if (j <= k) reservoir.set(j - 1, item); // probability k / i
            }
        }
        return reservoir;
    }
}
