import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Semaphore;

/**
 * Three semaphore patterns on real threads (the first two from The Little Book of Semaphores).
 * limit: a semaphore that starts at k lets at most k threads inside at once. first: a semaphore
 * that starts at 0 makes T2 wait for T1's signal. turns: two semaphores make two threads take
 * turns.
 *
 * Room runs the limit pattern one step at a time instead, so a caller can pick the
 * interleaving. Its s goes below 0 to count the waiting threads, as the page draws it;
 * java.util.concurrent.Semaphore makes a thread wait instead.
 */
public class Semaphores {
    static void runAll(List<Runnable> jobs) throws InterruptedException {
        List<Thread> threads = new ArrayList<>();
        for (Runnable job : jobs) {
            Thread th = new Thread(job);
            threads.add(th);
            th.start();
        }
        for (Thread th : threads) th.join();
    }

    /** k threads go in and out of a room; returns the most inside at once. */
    public static int limit(int k, int room) throws InterruptedException {
        Semaphore s = new Semaphore(room);
        Object guard = new Object(); // for the inside count only
        int[] inside = {0};
        int[] most = {0};
        Runnable work = () -> {
            s.acquireUninterruptibly(); // P(s)
            try {
                synchronized (guard) {
                    inside[0]++; // in
                    most[0] = Math.max(most[0], inside[0]);
                }
                synchronized (guard) {
                    inside[0]--; // out
                }
            } finally {
                s.release(); // V(s)
            }
        };
        runAll(Collections.nCopies(k, work));
        return most[0];
    }

    public static List<String> first() throws InterruptedException {
        Semaphore a = new Semaphore(0);
        List<String> out = Collections.synchronizedList(new ArrayList<>());
        Runnable t1 = () -> {
            out.add("one");
            a.release(); // V(a)
        };
        Runnable t2 = () -> {
            a.acquireUninterruptibly(); // P(a): wait for T1
            out.add("two");
        };
        runAll(List.of(t2, t1)); // T2 starts first, and still prints second
        return out;
    }

    public static List<String> turns(int times) throws InterruptedException {
        Semaphore a = new Semaphore(1);
        Semaphore b = new Semaphore(0);
        List<String> out = Collections.synchronizedList(new ArrayList<>());
        Runnable ping = () -> take(a, b, "ping", times, out);
        Runnable pong = () -> take(b, a, "pong", times, out);
        runAll(List.of(pong, ping));
        return out;
    }

    static void take(Semaphore mine, Semaphore theirs, String word, int times, List<String> out) {
        for (int i = 0; i < times; i++) {
            mine.acquireUninterruptibly(); // P: wait for my turn
            out.add(word);
            theirs.release(); // V: hand the turn over
        }
    }

    /** 3 threads, each: P(s), print("in"), print("out"), V(s). */
    public static class Room {
        int s;
        final ArrayDeque<Integer> line = new ArrayDeque<>(); // waiting on s, first come first
        final int[] pc = new int[3]; // each thread's next step
        final List<String> out = new ArrayList<>();

        public Room(int room) {
            s = room;
        }

        /** Runs thread t's next step. False if it is done or waits on s. */
        public boolean step(int t) {
            if (pc[t] == 4 || line.contains(t)) return false;
            switch (pc[t]) {
                case 0 -> { // P(s)
                    s--;
                    if (s < 0) {
                        line.add(t); // wait; this thread takes no more steps
                        return true;
                    }
                }
                case 1 -> out.add("in");
                case 2 -> out.add("out");
                default -> { // V(s): wake the first waiting thread, whose P(s) returns
                    s++;
                    Integer w = line.poll();
                    if (w != null) pc[w] = 1;
                }
            }
            pc[t]++;
            return true;
        }
    }
}
