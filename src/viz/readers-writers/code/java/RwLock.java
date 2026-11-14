import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.ReentrantLock;

/**
 * A read-write lock from a lock, a count and a semaphore (Downey's lightswitch). Readers share the
 * room; a writer needs it alone. n counts the readers inside and the lock m guards n. The first
 * reader in takes room, which keeps writers out; the last one out gives it back. With noStarve,
 * everyone also passes a turnstile, which a waiting writer holds, so readers who come after it
 * wait behind it. (java.util.concurrent.locks.ReentrantReadWriteLock is the library's version.)
 *
 * RwLock.Steps runs the page's program (readers first) one step at a time instead, keeping the
 * lock and the semaphore by hand, so a caller can pick the interleaving.
 */
public class RwLock {
    private final ReentrantLock m = new ReentrantLock(); // guards n
    private int n = 0; // readers inside
    private final Semaphore room = new Semaphore(1); // held by the readers together, or one writer
    private final Semaphore turn; // null unless noStarve

    public RwLock(boolean noStarve) {
        turn = noStarve ? new Semaphore(1) : null;
    }

    public void readLock() {
        if (turn != null) {
            turn.acquireUninterruptibly();
            turn.release();
        }
        m.lock();
        try {
            if (++n == 1) room.acquireUninterruptibly(); // the first reader in locks the writers out
        } finally {
            m.unlock();
        }
    }

    public void readUnlock() {
        m.lock();
        try {
            if (--n == 0) room.release(); // the last reader out lets them in
        } finally {
            m.unlock();
        }
    }

    public void writeLock() {
        if (turn != null) turn.acquireUninterruptibly();
        room.acquireUninterruptibly();
    }

    public void writeUnlock() {
        if (turn != null) turn.release();
        room.release();
    }

    /**
     * k readers and one writer, `rounds` visits each. Returns how many times a thread found the
     * room shared with a writer (0 when the lock works).
     */
    public static int runThreads(int k, int rounds, boolean noStarve) throws InterruptedException {
        RwLock rw = new RwLock(noStarve);
        Object guard = new Object();
        int[] inside = new int[2]; // readers, writers
        int[] bad = {0};
        Runnable visitR = () -> visit(guard, inside, bad, 0);
        Runnable visitW = () -> visit(guard, inside, bad, 1);
        List<Thread> threads = new ArrayList<>();
        threads.add(new Thread(() -> {
            for (int i = 0; i < rounds; i++) {
                rw.writeLock();
                visitW.run();
                rw.writeUnlock();
            }
        }));
        for (int j = 0; j < k; j++)
            threads.add(new Thread(() -> {
                for (int i = 0; i < rounds; i++) {
                    rw.readLock();
                    visitR.run();
                    rw.readUnlock();
                }
            }));
        for (Thread th : threads) th.start();
        for (Thread th : threads) th.join();
        return bad[0];
    }

    private static void visit(Object guard, int[] inside, int[] bad, int kind) {
        synchronized (guard) {
            inside[kind]++;
            if (inside[1] > 0 && (inside[0] > 0 || inside[1] > 1)) bad[0]++;
        }
        synchronized (guard) {
            inside[kind]--;
        }
    }

    /**
     * The page's steps. Writer (thread 0): P(room), write, V(room). Reader: lock(m) and n += 1;
     * if n == 1: P(room), then unlock(m); read; lock(m) and n -= 1; if n == 0: V(room), then
     * unlock(m). Each pair is one step unless it waits in the middle.
     */
    public static class Steps {
        static final String[][] WRITER = {{"P"}, {"write"}, {"V"}};
        static final String[][] READER = {{"lock", "add"}, {"first", "unlock"}, {"read"}, {"lock", "sub"}, {"last", "unlock"}};
        int n = 0, room = 1;
        Integer holder = null;
        final ArrayDeque<Integer> mLine = new ArrayDeque<>(), roomLine = new ArrayDeque<>();
        final String[][][] plans;
        final int[] row, part, r;
        final String[] waits; // "m" or "room" while blocked

        public Steps(int k) {
            plans = new String[k + 1][][];
            plans[0] = WRITER;
            for (int t = 1; t <= k; t++) plans[t] = READER;
            row = new int[k + 1];
            part = new int[k + 1];
            r = new int[k + 1];
            waits = new String[k + 1];
            Arrays.fill(waits, null);
        }

        boolean done(int t) {
            return row[t] == plans[t].length;
        }

        /** Runs thread t's next step (one row). False if it is done or waits. */
        public boolean step(int t) {
            if (done(t) || waits[t] != null) return false;
            int at = row[t];
            while (!done(t) && row[t] == at && waits[t] == null) part(t, plans[t][at][part[t]]);
            return true;
        }

        void advance(int t) {
            if (part[t] + 1 < plans[t][row[t]].length) part[t]++;
            else {
                row[t]++;
                part[t] = 0;
            }
        }

        void part(int t, String what) {
            switch (what) {
                case "lock" -> {
                    if (holder != null) {
                        mLine.add(t);
                        waits[t] = "m";
                        return;
                    }
                    holder = t;
                }
                case "unlock" -> { // hand m to the first in line
                    holder = mLine.poll();
                    if (holder != null) wake(holder);
                }
                case "add", "sub" -> {
                    n += what.equals("add") ? 1 : -1;
                    r[t] = n;
                }
                case "P", "first" -> {
                    if (what.equals("P") || r[t] == 1) {
                        if (--room < 0) {
                            roomLine.add(t);
                            waits[t] = "room";
                            return;
                        }
                    }
                }
                case "V", "last" -> {
                    if (what.equals("V") || r[t] == 0) {
                        room++;
                        if (!roomLine.isEmpty()) wake(roomLine.poll());
                    }
                }
                default -> { }
            }
            advance(t);
        }

        void wake(int t) {
            waits[t] = null;
            advance(t); // its lock or P returns
        }
    }
}
