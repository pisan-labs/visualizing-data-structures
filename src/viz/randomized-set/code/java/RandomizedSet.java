import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.function.IntUnaryOperator;

/** A set with insert, remove and a random value, all O(1) expected. */
public class RandomizedSet {
    private final List<Integer> items = new ArrayList<>(); // the values, in no particular order
    private final Map<Integer, Integer> index = new HashMap<>(); // value -> its index in items
    private final IntUnaryOperator pick; // pick(n) returns a random index from 0 to n - 1

    public RandomizedSet() {
        this(new Random()::nextInt);
    }

    public RandomizedSet(IntUnaryOperator pick) {
        this.pick = pick;
    }

    public boolean insert(int x) {
        if (index.containsKey(x)) return false;
        index.put(x, items.size());
        items.add(x);
        return true;
    }

    public boolean remove(int x) {
        Integer i = index.get(x);
        if (i == null) return false;
        int last = items.get(items.size() - 1);
        items.set(i, last); // fill the hole with the last value
        items.remove(items.size() - 1);
        index.put(last, i);
        index.remove(x);
        return true;
    }

    public int getRandom() {
        return items.get(pick.applyAsInt(items.size()));
    }

    public int size() {
        return items.size();
    }
}
