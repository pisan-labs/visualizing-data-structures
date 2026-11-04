import java.util.Map;

/** Two recursions with overlapping subproblems, with and without a memo. */
public class Recursion {
    /** Counts every call, to compare the tree with the memoized DAG. */
    public static long calls = 0;

    public static long fib(int n) {
        calls++;
        if (n <= 1) {
            return n;
        }
        long x = fib(n - 1);
        long y = fib(n - 2);
        return x + y;
    }

    /** fib(n), computing each subproblem once. */
    public static long fib(int n, Map<Integer, Long> memo) {
        calls++;
        if (n <= 1) {
            return n;
        }
        Long known = memo.get(n);
        if (known != null) {
            return known;
        }
        long x = fib(n - 1, memo);
        long y = fib(n - 2, memo);
        memo.put(n, x + y);
        return x + y;
    }

    /** C(n, k): the number of ways to choose k of n things. */
    public static long binomial(int n, int k) {
        calls++;
        if (k == 0 || k == n) {
            return 1;
        }
        long x = binomial(n - 1, k - 1);
        long y = binomial(n - 1, k);
        return x + y;
    }

    /** C(n, k), computing each subproblem once. memo[n][k] is null until it is known. */
    public static long binomial(int n, int k, Long[][] memo) {
        calls++;
        if (k == 0 || k == n) {
            return 1;
        }
        if (memo[n][k] != null) {
            return memo[n][k];
        }
        long x = binomial(n - 1, k - 1, memo);
        long y = binomial(n - 1, k, memo);
        memo[n][k] = x + y;
        return x + y;
    }
}
