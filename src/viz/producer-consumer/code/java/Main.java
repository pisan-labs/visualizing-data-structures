import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Test driver: reads one operation per line, prints one result per line. Real threads are not
 * deterministic, so BoundedBuffer.Steps drives the steps one at a time; "threads" runs
 * BoundedBuffer on real threads, where every item gets through once.
 */
public class Main {
    static final String[] NAMES = {"P1", "C1", "C2"};

    static String names(ArrayDeque<Integer> ts) {
        String s = ts.stream().map(t -> NAMES[t]).collect(Collectors.joining(","));
        return s.isEmpty() ? "-" : s;
    }

    static String show(BoundedBuffer.Steps c) {
        return "n=" + c.n + " holder=" + (c.holder == null ? "-" : NAMES[c.holder]) + " line="
                + names(c.line) + " room=" + names(c.sleep.get("room")) + " item=" + names(c.sleep.get("item"));
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> out = new ArrayList<>();
        int size = 0, start = 0;
        BoundedBuffer.Steps c = null;
        String raw;
        while ((raw = in.readLine()) != null) {
            String[] p = raw.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    size = Integer.parseInt(p[1]);
                    start = Integer.parseInt(p[2]);
                    c = new BoundedBuffer.Steps(size, start);
                }
                case "step" -> {
                    int t = Integer.parseInt(p[1]) - 1;
                    if (c.step(t)) out.add(show(c));
                    else out.add(c.blocked[t] ? "waits" : "done");
                }
                case "run" -> {
                    c = new BoundedBuffer.Steps(size, start);
                    boolean ok = true;
                    for (char d : p[1].toCharArray()) {
                        if (!c.step(d - '1')) {
                            ok = false;
                            break;
                        }
                    }
                    out.add(ok ? show(c) : "stopped");
                }
                case "reset" -> {
                    c = new BoundedBuffer.Steps(size, start);
                    out.add("n=" + start);
                }
                case "threads" -> {
                    int[] r = BoundedBuffer.runThreads(Integer.parseInt(p[1]));
                    out.add(r[0] + " " + r[1]);
                }
                default -> { }
            }
        }
        System.out.println(String.join("\n", out));
    }
}
