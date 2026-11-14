import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line. Real threads are not
 * deterministic, so Barrier.Steps drives the steps one at a time; "threads" runs real threads at
 * both barriers, where nobody goes on early.
 */
public class Main {
    static String names(Iterable<Integer> ts) {
        List<String> out = new ArrayList<>();
        for (int t : ts) out.add("T" + (t + 1));
        return out.isEmpty() ? "-" : String.join(",", out);
    }

    static String show(Barrier.Steps c) {
        List<Integer> early = new ArrayList<>();
        for (int t = 0; t < 3; t++) if (c.early[t]) early.add(t);
        return "count=" + c.count + " b=" + c.b + " waiting=" + names(c.line) + " early=" + names(early);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> out = new ArrayList<>();
        boolean naive = false;
        Barrier.Steps c = null;
        String raw;
        while ((raw = in.readLine()) != null) {
            String[] p = raw.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    naive = p[2].equals("1");
                    c = new Barrier.Steps(naive);
                }
                case "step" -> {
                    int t = Integer.parseInt(p[1]) - 1;
                    if (t >= 3) out.add("none");
                    else if (c.step(t)) out.add(show(c));
                    else out.add(c.blocked[t] ? "waits" : "done");
                }
                case "run" -> {
                    c = new Barrier.Steps(naive);
                    boolean ok = true;
                    for (char d : p[1].toCharArray()) {
                        int t = d - '1';
                        if (t < 0 || t >= 3 || !c.step(t)) {
                            ok = false;
                            break;
                        }
                    }
                    out.add(ok ? show(c) : "stopped");
                }
                case "reset" -> {
                    c = new Barrier.Steps(naive);
                    out.add("count=0");
                }
                case "threads" -> out.add(Barrier.runThreads(3, 100) == 0 ? "ok" : "early");
                default -> { }
            }
        }
        System.out.println(String.join("\n", out));
    }
}
