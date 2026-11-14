import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A counter without a lock: read, compute, compare-and-swap, and retry on failure.
 * AtomicInteger.compareAndSet is the hardware's compare-and-swap. increment is the loop the page
 * steps through.
 *
 * Cas.Steps runs the page's program one step at a time instead (with the cas, or with a plain
 * store), so a caller can pick the interleaving.
 */
public class Cas {
    /** Add 1 to n. Returns how many times the swap failed and had to be retried. */
    static int increment(AtomicInteger n) {
        int retries = 0;
        while (true) {
            int r = n.get();
            int s = r + 1;
            if (n.compareAndSet(r, s)) return retries;
            retries++; // another thread changed n since we read it
        }
    }

    /** k real threads each add 1 to n `times` times. Returns n. */
    public static int runThreads(int k, int times) throws InterruptedException {
        AtomicInteger n = new AtomicInteger();
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < k; i++)
            threads.add(new Thread(() -> {
                for (int j = 0; j < times; j++) increment(n);
            }));
        for (Thread th : threads) th.start();
        for (Thread th : threads) th.join();
        return n.get();
    }

    /** Thread t: r = n, s = r + 1, then ok = cas(n, r, s) and a retry if it failed (or n = s). */
    public static class Steps {
        int n = 0;
        final boolean cas;
        final int[] pc, r, s, ok, retries;

        public Steps(int k, boolean cas) {
            this.cas = cas;
            pc = new int[k];
            r = new int[k];
            s = new int[k];
            ok = new int[k];
            retries = new int[k];
        }

        /** Runs thread t's next step. False if it is done. */
        public boolean step(int t) {
            int k = pc[t];
            if (k == (cas ? 4 : 3)) return false;
            if (k == 0) r[t] = n;
            else if (k == 1) s[t] = r[t] + 1;
            else if (k == 2 && !cas) n = s[t];
            else if (k == 2) { // compare-and-swap, as one step
                ok[t] = n == r[t] ? 1 : 0;
                if (ok[t] == 1) n = s[t];
            } else if (ok[t] == 0) { // the swap failed: count it and read again
                retries[t]++;
                pc[t] = 0;
                return true;
            }
            pc[t]++;
            return true;
        }
    }
}
