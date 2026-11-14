import java.util.ArrayDeque;

/** Four ways to let at most limit requests through per window seconds; t is in whole seconds. */
public final class RateLimiters {
    private RateLimiters() {}

    public interface Limiter {
        boolean allow(int t);
    }

    /** At most limit requests in each window [k * window, (k + 1) * window). */
    public static final class FixedWindow implements Limiter {
        private final int limit, window;
        private int start = 0, count = 0;

        public FixedWindow(int limit, int window) {
            this.limit = limit;
            this.window = window;
        }

        public boolean allow(int t) {
            if (t >= start + window) {
                start = t / window * window;
                count = 0;
            }
            if (count < limit) {
                count++;
                return true;
            }
            return false;
        }
    }

    /** The times of the requests let through in the last window seconds, oldest first. */
    public static final class SlidingLog implements Limiter {
        private final int limit, window;
        private final ArrayDeque<Integer> log = new ArrayDeque<>();

        public SlidingLog(int limit, int window) {
            this.limit = limit;
            this.window = window;
        }

        public boolean allow(int t) {
            while (!log.isEmpty() && log.peekFirst() <= t - window) log.pollFirst();
            if (log.size() < limit) {
                log.addLast(t);
                return true;
            }
            return false;
        }
    }

    /**
     * This window's count and the previous one's. The last window seconds hold about
     * curr + prev * (window - (t - start)) / window requests.
     */
    public static final class SlidingWindowCounter implements Limiter {
        private final int limit, window;
        private int start = 0, prev = 0, curr = 0;

        public SlidingWindowCounter(int limit, int window) {
            this.limit = limit;
            this.window = window;
        }

        public boolean allow(int t) {
            int w = t / window * window;
            if (w == start + window) {
                prev = curr;
                curr = 0;
            } else if (w > start + window) {
                prev = 0;
                curr = 0;
            }
            start = w;
            int overlap = window - (t - start);
            // estimate < limit, times window, so the arithmetic stays in whole numbers
            if (curr * window + prev * overlap < limit * window) {
                curr++;
                return true;
            }
            return false;
        }
    }

    /**
     * At most limit tokens, and limit more every window seconds. Tokens are kept in units of
     * 1 / window (a token is window units), so the arithmetic is exact.
     */
    public static final class TokenBucket implements Limiter {
        private final int limit, window;
        private int units, last = 0;

        public TokenBucket(int limit, int window) {
            this.limit = limit;
            this.window = window;
            this.units = limit * window; // starts full
        }

        public boolean allow(int t) {
            units = Math.min(limit * window, units + (t - last) * limit);
            last = t;
            if (units >= window) {
                units -= window;
                return true;
            }
            return false;
        }
    }
}
