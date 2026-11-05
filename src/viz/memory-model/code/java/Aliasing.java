import java.util.ArrayList;
import java.util.List;

/**
 * What a method can and cannot do to its caller's variables. An int variable holds the number;
 * a List variable holds a reference. Calling f(xs) copies that reference into f's parameter, so
 * f can change the list, but not which list xs refers to.
 */
public class Aliasing {
    /** Changes the list the caller's variable refers to. */
    public static void grow(List<Integer> a) {
        a.add(0);
    }

    /** Points only this method's a at a new list. */
    public static List<Integer> reset(List<Integer> a) {
        a = new ArrayList<>(List.of(0));
        return a;
    }

    /** Changes only this method's n. */
    public static int bump(int n) {
        n = n + 1;
        return n;
    }

    public static void main(String[] args) {
        List<Integer> xs = new ArrayList<>(List.of(1, 2));
        List<Integer> ys = xs; // ys and xs are two names for one list
        ys.add(3);
        System.out.println(xs); // [1, 2, 3]
        grow(xs);
        System.out.println(xs); // [1, 2, 3, 0]
        reset(xs);
        System.out.println(xs); // still [1, 2, 3, 0]
    }
}
