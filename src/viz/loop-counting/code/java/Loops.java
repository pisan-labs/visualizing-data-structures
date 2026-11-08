/** Loop patterns. Each returns how many times its innermost line runs. */
public class Loops {
    public static long single(int n) {
        long count = 0;
        for (int i = 1; i <= n; i++) {
            count++;
        }
        return count;
    }

    public static long nested(int n) {
        long count = 0;
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= n; j++) {
                count++;
            }
        }
        return count;
    }

    public static long triangle(int n) {
        long count = 0;
        for (int i = 1; i <= n; i++) {
            for (int j = i; j <= n; j++) {
                count++;
            }
        }
        return count;
    }

    public static long pairs(int n) {
        long count = 0;
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j < i; j++) {
                count++;
            }
        }
        return count;
    }

    public static long sequence(int n) {
        long count = 0;
        for (int i = 1; i <= n; i++) {
            count++;
        }
        for (int j = 1; j <= n; j++) { // starts after the first loop ends
            count++;
        }
        return count;
    }

    public static long halving(int n) {
        long count = 0;
        for (int i = n; i > 1; i /= 2) {
            count++;
        }
        return count;
    }

    public static long squareRoot(int n) {
        long count = 0;
        for (int i = 1; i * i <= n; i++) {
            count++;
        }
        return count;
    }

    public static long doubling(int n) {
        long count = 0;
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= n; j *= 2) {
                count++;
            }
        }
        return count;
    }

    public static long geometric(int n) {
        long count = 0;
        for (int i = 1; i <= n; i *= 2) {
            for (int j = 1; j <= i; j++) {
                count++;
            }
        }
        return count;
    }

    /** Looks for x in a and returns the number of comparisons made. */
    public static long search(int[] a, int x) {
        long count = 0;
        for (int item : a) {
            count++;
            if (item == x) {
                return count; // the early exit
            }
        }
        return count;
    }

    public static long triple(int n) {
        long count = 0;
        for (int i = 1; i <= n; i++) {
            for (int j = i; j <= n; j++) {
                for (int k = j; k <= n; k++) {
                    count++;
                }
            }
        }
        return count;
    }
}
