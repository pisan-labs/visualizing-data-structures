import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/** Built left to right with a stack holding the right spine. Smallest value on top. */
public class CartesianTree {
    final List<Integer> values = new ArrayList<>(); // node i holds A[i]
    final List<Integer> left = new ArrayList<>();   // child indexes, or -1
    final List<Integer> right = new ArrayList<>();
    int root = -1;
    private final Deque<Integer> stack = new ArrayDeque<>(); // the right spine

    /** Add x at the end of the array. Returns how many nodes it popped. */
    int append(int x) {
        int z = values.size();
        values.add(x);
        left.add(-1);
        right.add(-1);
        int last = -1;
        int pops = 0;
        while (!stack.isEmpty() && values.get(stack.peek()) > x) {
            last = stack.pop();
            pops++;
        }
        left.set(z, last);
        if (!stack.isEmpty()) {
            right.set(stack.peek(), z);
        } else {
            root = z;
        }
        stack.push(z);
        return pops;
    }

    /** Index of the smallest value in A[i..j], and how many nodes the walk visited. */
    int[] rmq(int i, int j) {
        int x = root;
        int visited = 1;
        while (x < i || x > j) {
            x = x < i ? right.get(x) : left.get(x);
            visited++;
        }
        return new int[] {x, visited};
    }

    void preorder(int x, List<Integer> out) {
        if (x < 0) return;
        out.add(values.get(x));
        preorder(left.get(x), out);
        preorder(right.get(x), out);
    }
}
