import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * count = count + 1 is three steps: load, add, store. Race runs the increments of several
 * threads one step at a time, so a caller can pick the interleaving; runThreads hands the
 * choice to real threads instead.
 */
public class Race {
    int count = 0; // shared by every thread
    final int steps; // each thread adds 1, `times` times
    final int[] pc; // each thread's next step
    final int[] reg; // each thread's register

    public Race(int threads, int times) {
        steps = 3 * times;
        pc = new int[threads];
        reg = new int[threads];
    }

    private Race(Race o) {
        count = o.count;
        steps = o.steps;
        pc = o.pc.clone();
        reg = o.reg.clone();
    }

    /** Runs thread t's next step. False if it has no steps left. */
    public boolean step(int t) {
        if (pc[t] == steps) return false;
        switch (pc[t] % 3) {
            case 0 -> reg[t] = count; // load
            case 1 -> reg[t] = reg[t] + 1; // add
            default -> count = reg[t]; // store
        }
        pc[t]++;
        return true;
    }

    /**
     * Runs every thread to the end on real threads. The scheduler may switch threads between
     * a load and its store, so count can come out short. One at a time, each thread
     * finishes before the next starts.
     */
    public int runThreads(boolean oneAtATime) throws InterruptedException {
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < pc.length; t++) {
            final int me = t;
            Thread th = new Thread(() -> {
                while (step(me)) { }
            });
            threads.add(th);
            th.start();
            if (oneAtATime) th.join();
        }
        for (Thread th : threads) th.join();
        return count;
    }

    /** Every interleaving from start: final count -> how many schedules. */
    public static Map<Integer, Long> outcomes(Race start) {
        Map<Integer, Long> found = new TreeMap<>();
        explore(start, found);
        return found;
    }

    private static void explore(Race r, Map<Integer, Long> found) {
        boolean moved = false;
        for (int t = 0; t < r.pc.length; t++) {
            Race next = new Race(r);
            if (next.step(t)) {
                moved = true;
                explore(next, found);
            }
        }
        if (!moved) found.merge(r.count, 1L, Long::sum);
    }
}
