/** Recursive factorial, plain and with an accumulator. */
public class Factorial {
    /** n! for n >= 0. Each call waits for factorial(n - 1), then multiplies. */
    public static long factorial(int n) {
        if (n == 0) {
            return 1;
        }
        return n * factorial(n - 1);
    }

    /**
     * n! with an accumulator: the recursive call is the last thing it does (a tail call).
     * Java does not optimize tail calls, so this still uses one frame per call.
     */
    public static long factorialTail(int n, long acc) {
        if (n == 0) {
            return acc;
        }
        return factorialTail(n - 1, n * acc);
    }
}
