import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Barriers on real threads: nobody goes on until all n have arrived. Barrier.OneShot is Downey's
 * barrier: a count guarded by a lock, and a semaphore that starts at 0 as a turnstile. Barrier
 * itself is his reusable two-phase barrier with preloaded turnstiles: the last to arrive lets all
 * n through the first, and the last to leave lets all n through the second, so nobody can lap the
 * others. (java.util.concurrent.CyclicBarrier is the library's version.)
 *
 * Barrier.Steps runs the page's barrier one step at a time instead, keeping the semaphore by hand,
 * so a caller can pick the interleaving.
 */
public class Barrier {
    private final int n;
    private int count = 0;
    private final ReentrantLock m = new ReentrantLock();
    private final Semaphore b1 = new Semaphore(0), b2 = new Semaphore(0);

    public Barrier(int n) {
        this.n = n;
    }

    public void await() {
        m.lock();
        if (++count == n) b1.release(n); // let all n through the first turnstile
        m.unlock();
        b1.acquireUninterruptibly();
        m.lock();
        if (--count == 0) b2.release(n); // and all n through the second
        m.unlock();
        b2.acquireUninterruptibly();
    }

    public static class OneShot {
        private final int n;
        private int count = 0;
        private final ReentrantLock m = new ReentrantLock(); // guards count
        private final Semaphore b = new Semaphore(0); // the turnstile, shut

        public OneShot(int n) {
            this.n = n;
        }

        public void await() {
            m.lock();
            int r = ++count;
            m.unlock();
            if (r == n) b.release(); // the last to arrive opens the turnstile
            b.acquireUninterruptibly(); // P(b)
            b.release(); // V(b): let the next one through
        }
    }

    /**
     * n real threads at a one-shot barrier, then `rounds` times round a reusable one. Returns how
     * many times a thread went on before all had arrived (0 when it works).
     */
    public static int runThreads(int n, int rounds) throws InterruptedException {
        Object guard = new Object();
        int[] arrived = new int[n];
        int[] bad = {0};
        OneShot once = new OneShot(n);
        Barrier again = new Barrier(n);
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            int me = i;
            threads.add(new Thread(() -> {
                for (int k = 1; k <= rounds + 1; k++) {
                    synchronized (guard) {
                        arrived[me]++;
                    }
                    if (k == 1) once.await();
                    else again.await();
                    synchronized (guard) {
                        int least = Integer.MAX_VALUE;
                        for (int a : arrived) least = Math.min(least, a);
                        if (least < k) bad[0]++;
                    }
                }
            }));
        }
        for (Thread th : threads) th.start();
        for (Thread th : threads) th.join();
        return bad[0];
    }

    /**
     * Thread t: count += 1 (r = count); if r == 3: V(b); P(b); V(b); go. Naive: count += 1, then
     * go. go notes a thread that leaves while count < 3.
     */
    public static class Steps {
        int count = 0, b = 0;
        final ArrayDeque<Integer> line = new ArrayDeque<>();
        final int[] pc = new int[3], r = new int[3];
        final boolean[] blocked = new boolean[3], early = new boolean[3];
        final String[] plan;

        public Steps(boolean naive) {
            plan = naive ? new String[] {"arrive", "go"} : new String[] {"arrive", "last", "P", "V", "go"};
        }

        /** Runs thread t's next step. False if it is done or waits. */
        public boolean step(int t) {
            if (pc[t] == plan.length || blocked[t]) return false;
            switch (plan[pc[t]]) {
                case "arrive" -> r[t] = ++count;
                case "last" -> {
                    if (r[t] == 3) up();
                }
                case "P" -> {
                    if (--b < 0) {
                        line.add(t);
                        blocked[t] = true;
                        return true;
                    }
                }
                case "V" -> up();
                default -> early[t] = count < 3;
            }
            pc[t]++;
            return true;
        }

        void up() {
            b++;
            if (!line.isEmpty()) { // the first waiting goes on: its P returns
                int w = line.poll();
                blocked[w] = false;
                pc[w]++;
            }
        }
    }
}
