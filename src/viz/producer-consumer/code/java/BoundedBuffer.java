import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

/**
 * A bounded buffer with a lock and two condition variables. put waits while the buffer is
 * full, get waits while it is empty, and each wakes the other side. The waits sit in while
 * loops: a woken thread does not run at once, and by the time it has the lock again another
 * thread may have taken the item (or the room).
 *
 * BoundedBuffer.Steps runs the page's program one step at a time instead (P1 puts one item,
 * C1 and C2 take one each), so a caller can pick the interleaving. It keeps the lock and the
 * condition variables by hand: one test thread cannot hold a real lock for another.
 */
public class BoundedBuffer {
    private final int size;
    private final ArrayDeque<Integer> items = new ArrayDeque<>();
    private final ReentrantLock m = new ReentrantLock();
    private final Condition room = m.newCondition(); // put waits here while full
    private final Condition item = m.newCondition(); // get waits here while empty

    public BoundedBuffer(int size) {
        this.size = size;
    }

    public void put(int x) {
        m.lock();
        try {
            while (items.size() == size) room.awaitUninterruptibly(); // while, not if
            items.add(x);
            item.signal(); // wake a consumer, if one sleeps
        } finally {
            m.unlock();
        }
    }

    public int get() {
        m.lock();
        try {
            while (items.isEmpty()) item.awaitUninterruptibly();
            int x = items.poll();
            room.signal(); // wake the producer, if it sleeps
            return x;
        } finally {
            m.unlock();
        }
    }

    public int left() {
        m.lock();
        try {
            return items.size();
        } finally {
            m.unlock();
        }
    }

    /** A producer puts 1 to 6; two consumers take 3 each. Returns {sum taken, left}. */
    public static int[] runThreads(int size) throws InterruptedException {
        BoundedBuffer buf = new BoundedBuffer(size);
        int[] sums = new int[2];
        List<Thread> threads = new ArrayList<>();
        for (int c = 0; c < 2; c++) {
            final int me = c;
            threads.add(new Thread(() -> {
                for (int i = 0; i < 3; i++) sums[me] += buf.get();
            }));
        }
        threads.add(new Thread(() -> {
            for (int x = 1; x <= 6; x++) buf.put(x);
        }));
        for (Thread th : threads) th.start();
        for (Thread th : threads) th.join();
        return new int[] {sums[0] + sums[1], buf.left()};
    }

    /**
     * P1 (t = 0) puts one item, C1 and C2 take one each. Each thread runs: 0 lock(m),
     * 1 t: r = n < size (P1) or n > 0 (C), 2 if r goto 5, 3 wait(cv, m), 4 goto t,
     * 5 r = n + 1 or n - 1, 6 n = r, 7 signal(other cv), 8 unlock(m).
     */
    public static class Steps {
        final int size;
        int n;
        Integer holder = null; // who holds m
        final ArrayDeque<Integer> line = new ArrayDeque<>(); // waiting for m
        final Map<String, ArrayDeque<Integer>> sleep =
                Map.of("room", new ArrayDeque<>(), "item", new ArrayDeque<>()); // asleep on each
        final int[] pc = new int[3];
        final int[] r = new int[3];
        final boolean[] blocked = new boolean[3];

        public Steps(int size, int start) {
            this.size = size;
            this.n = start;
        }

        /** Let go of m: hand it to the first in line, whose lock or wait returns. */
        void release() {
            holder = line.poll();
            if (holder != null) {
                blocked[holder] = false;
                pc[holder]++;
            }
        }

        /** Runs thread t's next step. False if it is done or blocked. */
        public boolean step(int t) {
            if (pc[t] == 9 || blocked[t]) return false;
            boolean producer = t == 0;
            switch (pc[t]) {
                case 0 -> { // lock(m)
                    if (holder != null) {
                        line.add(t);
                        blocked[t] = true;
                        return true;
                    }
                    holder = t;
                }
                case 1 -> r[t] = (producer ? n < size : n > 0) ? 1 : 0;
                case 2 -> {
                    if (r[t] == 1) {
                        pc[t] = 5;
                        return true;
                    }
                }
                case 3 -> { // wait: let go of m and sleep
                    release();
                    sleep.get(producer ? "room" : "item").add(t);
                    blocked[t] = true;
                    return true;
                }
                case 4 -> { // goto t: check again
                    pc[t] = 1;
                    return true;
                }
                case 5 -> r[t] = n + (producer ? 1 : -1);
                case 6 -> n = r[t];
                case 7 -> { // signal: the woken thread must get m back first
                    Integer w = sleep.get(producer ? "item" : "room").poll();
                    if (w != null) line.add(w);
                }
                default -> release();
            }
            pc[t]++;
            return true;
        }
    }
}
