import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Test driver: reads one operation per line, prints one result per line. Real threads are not
 * deterministic, so Counter.Steps drives the five steps one at a time; "threads" runs
 * increment() on real threads at once, which the lock keeps right.
 */
public class Main {
    static String name(Integer t) {
        return t == null ? "-" : "T" + (t + 1);
    }

    static String show(Counter.Steps c) {
        String line = c.line.stream().map(Main::name).collect(Collectors.joining(","));
        return "count=" + c.count + " holder=" + name(c.holder) + " line=" + (line.isEmpty() ? "-" : line);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> out = new ArrayList<>();
        int k = 0;
        Counter.Steps c = null;
        String raw;
        while ((raw = in.readLine()) != null) {
            String[] p = raw.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    k = Integer.parseInt(p[1]);
                    c = new Counter.Steps(k);
                }
                case "step" -> {
                    int t = Integer.parseInt(p[1]) - 1;
                    if (t >= k) out.add("none");
                    else if (c.step(t)) out.add(show(c));
                    else out.add(c.line.contains(t) ? "waits" : "done");
                }
                case "run" -> {
                    c = new Counter.Steps(k);
                    boolean ok = true;
                    for (char d : p[1].toCharArray()) {
                        int t = d - '1';
                        if (t < 0 || t >= k || !c.step(t)) {
                            ok = false;
                            break;
                        }
                    }
                    out.add(ok ? show(c) : "stopped");
                }
                case "reset" -> {
                    c = new Counter.Steps(k);
                    out.add("count=0");
                }
                case "threads" -> out.add(String.valueOf(Counter.runThreads(k)));
                default -> { }
            }
        }
        System.out.println(String.join("\n", out));
    }
}
