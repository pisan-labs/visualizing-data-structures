import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * A batch of `slots` requests, run one iteration at a time. "continuous" fills a free slot at
 * every iteration (Orca's iteration-level scheduling); "static" starts a batch only when every
 * slot is free, and returns it when its longest request is done.
 */
public class Scheduler {
    static class Request {
        final String name;
        final int arrive, prompt, length;
        Integer start = null; // the iteration it got a slot
        int made = 0;         // tokens written so far
        Integer done = null;  // the time its answer is returned

        Request(String name, int arrive, int prompt, int length) {
            this.name = name;
            this.arrive = arrive;
            this.prompt = prompt;
            this.length = length;
        }
    }

    /** What one iteration did: who was in each slot (null when idle) and who returned. */
    record Iteration(Request[] ran, List<Request> returned) {}

    final Request[] slots;
    final boolean continuous;
    List<Request> batch = new ArrayList<>(); // static: the requests of the running batch
    final List<Request> requests = new ArrayList<>();
    int clock = 0;

    Scheduler(int slots, String policy) {
        this.slots = new Request[slots];
        this.continuous = policy.equals("continuous");
    }

    void add(Request r) {
        requests.add(r);
    }

    /** Arrived and not started, first come first served (ties in the order added). */
    List<Request> waiting() {
        List<Request> line = new ArrayList<>();
        for (Request r : requests)
            if (r.start == null && r.arrive <= clock) line.add(r);
        line.sort(Comparator.comparingInt(r -> r.arrive)); // a stable sort
        return line;
    }

    Iteration step() {
        int t = clock;
        List<Request> line = waiting();
        if (continuous || batch.isEmpty()) {
            for (int i = 0; i < slots.length; i++) {
                if (slots[i] == null && !line.isEmpty()) {
                    slots[i] = line.remove(0);
                    slots[i].start = t;
                    if (!continuous) batch.add(slots[i]);
                }
            }
        }
        Request[] ran = slots.clone();
        List<Request> returned = new ArrayList<>();
        for (int i = 0; i < slots.length; i++) {
            Request r = slots[i];
            if (r == null) continue;
            r.made++; // the first iteration reads the prompt and writes a token
            if (r.made == r.length) {
                slots[i] = null;
                if (continuous) {
                    r.done = t + 1;
                    returned.add(r);
                }
            }
        }
        if (!batch.isEmpty() && batch.stream().allMatch(r -> r.made == r.length)) {
            for (Request r : batch) r.done = t + 1;
            returned = batch;
            batch = new ArrayList<>();
        }
        clock++;
        return new Iteration(ran, returned);
    }

    boolean busy() {
        return requests.stream().anyMatch(r -> r.done == null);
    }
}
