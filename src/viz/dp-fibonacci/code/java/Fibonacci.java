/** Fibonacci numbers with dynamic programming: bottom-up, and top-down with a memo. */
public class Fibonacci {
    /** F(n) bottom-up: fill F[0..n] from the base cases. */
    public static long fib(int n) {
        long[] f = new long[n + 1];
        if (n > 0) {
            f[1] = 1;
        }
        for (int i = 2; i <= n; i++) {
            f[i] = f[i - 1] + f[i - 2];
        }
        return f[n];
    }

    /** F(n) top-down: recurse, but remember every answer in a memo. */
    public static long fibMemo(int n) {
        return memoFib(n, new Long[n + 1]);
    }

    private static long memoFib(int k, Long[] memo) {
        if (memo[k] == null) {
            memo[k] = k <= 1 ? k : memoFib(k - 1, memo) + memoFib(k - 2, memo);
        }
        return memo[k];
    }
}
