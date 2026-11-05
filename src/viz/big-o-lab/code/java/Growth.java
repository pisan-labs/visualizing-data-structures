/** Loops that do 1, log n, n, n log n, n^2, 2^n and n! steps. Each returns its step count. */
public class Growth {
    public static long constant(int n) {
        return 1;
    }

    public static long logarithmic(int n) {
        long steps = 0;
        while (n > 1) {
            n = n / 2;
            steps++;
        }
        return steps;
    }

    public static long linear(int n) {
        long steps = 0;
        for (int i = 0; i < n; i++) {
            steps++;
        }
        return steps;
    }

    public static long linearithmic(int n) {
        long steps = 0;
        for (int i = 0; i < n; i++) {
            steps += logarithmic(n); // halve n until 1, once per item
        }
        return steps;
    }

    public static long quadratic(int n) {
        long steps = 0;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                steps++;
            }
        }
        return steps;
    }

    public static long exponential(int n) {
        if (n == 0) {
            return 1;
        }
        return exponential(n - 1) + exponential(n - 1); // two calls, each one smaller
    }

    public static long factorial(int n) {
        if (n == 0) {
            return 1;
        }
        long steps = 0;
        for (int i = 0; i < n; i++) {
            steps += factorial(n - 1); // n calls, each one smaller
        }
        return steps;
    }
}
