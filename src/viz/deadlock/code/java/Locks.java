import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Two locks, taken in one global order, so no deadlock. withBoth is what you write with real
 * threads: it sorts the two locks by name before taking them, so every thread takes a before
 * b, whatever order it asks in.
 *
 * Locks.Steps runs the page's program one step at a time instead (each thread locks its two
 * locks in its own order, then unlocks them), keeping the locks by hand, so a caller can pick
 * the interleaving; findCycle looks for a cycle in the wait-for graph.
 */
public class Locks {
    /** Take locks x and y in one global order (by name), run work, let go. */
    static void withBoth(Map<String, ReentrantLock> locks, String x, String y, Runnable work) {
        ReentrantLock first = locks.get(x.compareTo(y) < 0 ? x : y);
        ReentrantLock second = locks.get(x.compareTo(y) < 0 ? y : x);
        first.lock();
        try {
            second.lock();
            try {
                work.run();
            } finally {
                second.unlock();
            }
        } finally {
            first.unlock();
        }
    }

    /**
     * Real threads, each asking for its two locks in its own order, all at once. Returns how
     * many times the work ran: every round of every thread.
     */
    public static int runThreads(List<String[]> orders, int rounds) throws InterruptedException {
        Map<String, ReentrantLock> locks = Map.of("a", new ReentrantLock(), "b", new ReentrantLock());
        int[] done = {0};
        List<Thread> threads = new ArrayList<>();
        for (String[] o : orders) {
            threads.add(new Thread(() -> {
                for (int i = 0; i < rounds; i++) withBoth(locks, o[0], o[1], () -> done[0]++);
            }));
        }
        for (Thread th : threads) th.start();
        for (Thread th : threads) th.join();
        return done[0];
    }

    /** Thread t runs lock(x), lock(y), unlock(y), unlock(x), where {x, y} = orders[t]. */
    public static class Steps {
        final List<String[]> orders;
        final Map<String, Integer> holder = new HashMap<>(); // who holds each lock
        final Map<String, ArrayDeque<Integer>> line = Map.of("a", new ArrayDeque<>(), "b", new ArrayDeque<>());
        final int[] pc;
        final String[] waitsFor; // the lock a blocked thread waits for

        public Steps(List<String[]> orders) {
            this.orders = orders;
            pc = new int[orders.size()];
            waitsFor = new String[orders.size()];
        }

        /** Runs thread t's next step. False if it is done or waits for a lock. */
        public boolean step(int t) {
            if (pc[t] == 4 || waitsFor[t] != null) return false;
            String x = orders.get(t)[0];
            String y = orders.get(t)[1];
            if (pc[t] < 2) { // lock(x), then lock(y)
                String name = pc[t] == 0 ? x : y;
                if (holder.get(name) != null) {
                    line.get(name).add(t);
                    waitsFor[t] = name;
                    return true;
                }
                holder.put(name, t);
            } else { // unlock(y), then unlock(x): hand it to the first in line
                String name = pc[t] == 2 ? y : x;
                Integer next = line.get(name).poll();
                holder.put(name, next);
                if (next != null) {
                    waitsFor[next] = null;
                    pc[next]++; // its lock returns
                }
            }
            pc[t]++;
            return true;
        }

        /**
         * Depth-first search of the wait-for graph (t -> the holder of the lock t waits for),
         * gray while on the path and black when done. Returns the first cycle, or null.
         */
        public List<Integer> findCycle() {
            int n = pc.length;
            int[] color = new int[n]; // 0 white, 1 gray, 2 black
            for (int u = 0; u < n; u++) {
                if (color[u] != 0) continue;
                List<Integer> found = visit(u, color, new ArrayList<>());
                if (found != null) return found;
            }
            return null;
        }

        private List<Integer> visit(int u, int[] color, List<Integer> path) {
            color[u] = 1;
            path.add(u);
            Integer v = waitsFor[u] == null ? null : holder.get(waitsFor[u]);
            if (v != null && color[v] == 1) return new ArrayList<>(path.subList(path.indexOf(v), path.size()));
            if (v != null && color[v] == 0) {
                List<Integer> found = visit(v, color, path);
                if (found != null) return found;
            }
            color[u] = 2;
            path.remove(path.size() - 1);
            return null;
        }
    }
}
