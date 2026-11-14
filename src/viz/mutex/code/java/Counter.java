import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * count = count + 1 inside a lock, so no update is lost. increment() is what you write with
 * real threads: synchronized takes the object's lock and lets go of it after the store.
 * Counter.Steps runs the same five steps one at a time, so a caller can pick the
 * interleaving; it keeps the lock by hand (who holds it, who waits in line), because one test
 * thread cannot hold a real lock "for" another.
 */
public class Counter {
    int count = 0;

    public synchronized void increment() { // lock(m) ... unlock(m)
        int r = count; // load
        r = r + 1; // add, in a local variable
        count = r; // store
    }

    /** k real threads each increment once, all at the same time. */
    public static int runThreads(int k) throws InterruptedException {
        Counter c = new Counter();
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < k; i++) {
            Thread th = new Thread(c::increment);
            threads.add(th);
            th.start();
        }
        for (Thread th : threads) th.join();
        return c.count;
    }

    /** k threads, each: lock(m), r = count, r = r + 1, count = r, unlock(m). */
    public static class Steps {
        int count = 0;
        Integer holder = null; // the thread that holds m, or null
        final ArrayDeque<Integer> line = new ArrayDeque<>(); // waiting for m, first in line first
        final int[] pc; // each thread's next step
        final int[] reg; // each thread's r

        public Steps(int k) {
            pc = new int[k];
            reg = new int[k];
        }

        /** Runs thread t's next step. False if it is done or waits in line. */
        public boolean step(int t) {
            if (pc[t] == 5 || line.contains(t)) return false;
            switch (pc[t]) {
                case 0 -> { // lock(m)
                    if (holder != null) {
                        line.add(t); // wait; this thread takes no more steps
                        return true;
                    }
                    holder = t;
                }
                case 1 -> reg[t] = count;
                case 2 -> reg[t] = reg[t] + 1;
                case 3 -> count = reg[t];
                default -> { // unlock(m): hand m to the first in line, whose lock(m) returns
                    holder = line.poll();
                    if (holder != null) pc[holder] = 1;
                }
            }
            pc[t]++;
            return true;
        }
    }
}
