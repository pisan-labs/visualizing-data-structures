import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line. Real threads are not
 * deterministic, so Locks.Steps drives the steps one at a time; "threads" runs real threads
 * that take the locks in one global order, which never deadlock.
 */
public class Main {
    static String name(Integer t) {
        return t == null ? "-" : "T" + (t + 1);
    }

    static String show(Locks.Steps c) {
        List<String> waiting = new ArrayList<>();
        for (int t = 0; t < c.waitsFor.length; t++)
            if (c.waitsFor[t] != null) waiting.add("T" + (t + 1) + ":" + c.waitsFor[t]);
        return "a=" + name(c.holder.get("a")) + " b=" + name(c.holder.get("b")) + " waiting="
                + (waiting.isEmpty() ? "-" : String.join(",", waiting));
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> out = new ArrayList<>();
        List<String[]> orders = new ArrayList<>();
        Locks.Steps c = null;
        String raw;
        while ((raw = in.readLine()) != null) {
            String[] p = raw.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    int k = Integer.parseInt(p[1]);
                    orders = new ArrayList<>();
                    for (int t = 0; t < k; t++)
                        orders.add(p[2].equals("opposite") && t == 1 ? new String[] {"b", "a"} : new String[] {"a", "b"});
                    c = new Locks.Steps(orders);
                }
                case "step" -> {
                    int t = Integer.parseInt(p[1]) - 1;
                    if (t >= orders.size()) out.add("none");
                    else if (c.step(t)) out.add(show(c));
                    else out.add(c.waitsFor[t] != null ? "waits" : "done");
                }
                case "run" -> {
                    c = new Locks.Steps(orders);
                    boolean ok = true;
                    for (char d : p[1].toCharArray()) {
                        int t = d - '1';
                        if (t < 0 || t >= orders.size() || !c.step(t)) {
                            ok = false;
                            break;
                        }
                    }
                    out.add(ok ? show(c) : "stopped");
                }
                case "cycle" -> {
                    List<Integer> found = c.findCycle();
                    if (found == null) out.add("none");
                    else {
                        List<String> names = new ArrayList<>();
                        for (int t : found) names.add("T" + (t + 1));
                        out.add(String.join(" ", names));
                    }
                }
                case "reset" -> {
                    c = new Locks.Steps(orders);
                    out.add("free");
                }
                case "threads" -> {
                    int rounds = 200;
                    out.add(Locks.runThreads(orders, rounds) == rounds * orders.size() ? "done" : "lost");
                }
                default -> { }
            }
        }
        System.out.println(String.join("\n", out));
    }
}
