import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Dining philosophers on real threads, with both fixes. dine is what you write with real
 * threads. Each fork is a ReentrantLock. "order": every philosopher takes the lower-numbered of
 * its forks first, so the last one takes its right fork first; one global order, so no cycle of
 * waits. "waiter": a Semaphore that starts at n - 1 lets at most n - 1 reach for forks.
 *
 * Dining.Table runs the page's program one step at a time instead, keeping the forks by hand, so
 * a caller can pick the interleaving (and find the deadlock).
 */
public class Dining {
    /** The two forks philosopher i takes, in its order. Its left fork is i, its right i + 1. */
    static int[] forksOf(int n, int i, String fix) {
        int left = i, right = (i + 1) % n;
        return fix.equals("order") && i == n - 1 ? new int[] {right, left} : new int[] {left, right};
    }

    /** n philosophers each eat `meals` times, on real threads. Returns the meals eaten. */
    public static int[] dine(int n, int meals, String fix) throws InterruptedException {
        ReentrantLock[] forks = new ReentrantLock[n];
        for (int i = 0; i < n; i++) forks[i] = new ReentrantLock();
        Semaphore waiter = new Semaphore(n - 1);
        int[] eaten = new int[n];
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            int me = i;
            int[] f = forksOf(n, i, fix);
            threads.add(new Thread(() -> {
                for (int k = 0; k < meals; k++) {
                    if (fix.equals("waiter")) waiter.acquireUninterruptibly();
                    forks[f[0]].lock();
                    forks[f[1]].lock();
                    eaten[me]++; // eat: only philosopher me writes eaten[me]
                    forks[f[1]].unlock();
                    forks[f[0]].unlock();
                    if (fix.equals("waiter")) waiter.release();
                }
            }));
        }
        for (Thread th : threads) th.start();
        for (Thread th : threads) th.join();
        return eaten;
    }

    /**
     * Philosopher t: [sit], take its first fork, take its second, eat, put the second down, put
     * the first down, [leave]. sit and leave are the waiter's P and V.
     */
    public static class Table {
        final int n;
        final String fix;
        final Integer[] holder; // who holds each fork
        final List<ArrayDeque<Integer>> line = new ArrayList<>(); // who waits for each fork
        int seats; // the waiter; below 0 it counts the philosophers waiting
        final ArrayDeque<Integer> seatLine = new ArrayDeque<>();
        final int[] pc;
        final String[] waits; // "f2" or "waiter" while blocked
        final List<Integer> ate = new ArrayList<>();
        final List<List<int[]>> plans = new ArrayList<>(); // {kind, fork}: 0 take, 1 put, 2 eat, 3 sit, 4 leave

        public Table(int n, String fix) {
            this.n = n;
            this.fix = fix;
            holder = new Integer[n];
            pc = new int[n];
            waits = new String[n];
            seats = n - 1;
            for (int t = 0; t < n; t++) {
                line.add(new ArrayDeque<>());
                int[] f = forksOf(n, t, fix);
                List<int[]> plan = new ArrayList<>();
                if (fix.equals("waiter")) plan.add(new int[] {3, 0});
                plan.add(new int[] {0, f[0]});
                plan.add(new int[] {0, f[1]});
                plan.add(new int[] {2, t});
                plan.add(new int[] {1, f[1]});
                plan.add(new int[] {1, f[0]});
                if (fix.equals("waiter")) plan.add(new int[] {4, 0});
                plans.add(plan);
            }
        }

        /** Runs philosopher t's next step. False if it is done or waits. */
        public boolean step(int t) {
            if (pc[t] == plans.get(t).size() || waits[t] != null) return false;
            int[] s = plans.get(t).get(pc[t]);
            int f = s[1];
            switch (s[0]) {
                case 0 -> {
                    if (holder[f] != null) {
                        line.get(f).add(t);
                        waits[t] = "f" + (f + 1);
                        return true;
                    }
                    holder[f] = t;
                }
                case 1 -> { // hand it to the first in line, if any
                    holder[f] = line.get(f).poll();
                    if (holder[f] != null) wake(holder[f]);
                }
                case 2 -> ate.add(t);
                case 3 -> {
                    if (--seats < 0) {
                        seatLine.add(t);
                        waits[t] = "waiter";
                        return true;
                    }
                }
                default -> {
                    seats++;
                    if (!seatLine.isEmpty()) wake(seatLine.poll());
                }
            }
            pc[t]++;
            return true;
        }

        void wake(int t) {
            waits[t] = null;
            pc[t]++; // its take or sit returns
        }
    }
}
