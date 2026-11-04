import java.util.Map;

/** Fibonacci numbers by recursion, with and without a memo. */
public class Fibonacci {
    /** Counts every call, to show how much work each version does. */
    public static long calls = 0;

    /** fib(n) the slow way: every call above the base cases makes two more. */
    public static long fib(int n) {
        calls++;
        if (n <= 1) {
            return n;
        }
        long x = fib(n - 1);
        long y = fib(n - 2);
        return x + y;
    }

    /** The same recursion, but each answer is computed once and kept in memo. */
    public static long fibMemo(int n, Map<Integer, Long> memo) {
        calls++;
        if (n <= 1) {
            return n;
        }
        Long known = memo.get(n);
        if (known != null) {
            return known;
        }
        long x = fibMemo(n - 1, memo);
        long y = fibMemo(n - 2, memo);
        memo.put(n, x + y);
        return x + y;
    }
}
