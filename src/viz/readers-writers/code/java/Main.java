import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line. Real threads are not
 * deterministic, so RwLock.Steps drives the steps one at a time; "threads" runs real readers and a
 * writer on RwLock, which never share the room with a writer.
 */
public class Main {
    static String name(int t) {
        return t == 0 ? "W" : "R" + t;
    }

    static String show(RwLock.Steps c) {
        List<String> waiting = new ArrayList<>();
        for (int t = 0; t < c.waits.length; t++) if (c.waits[t] != null) waiting.add(name(t) + ":" + c.waits[t]);
        return "n=" + c.n + " room=" + c.room + " m=" + (c.holder == null ? "-" : name(c.holder)) + " waiting="
                + (waiting.isEmpty() ? "-" : String.join(",", waiting));
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> out = new ArrayList<>();
        int k = 2;
        RwLock.Steps c = null;
        String raw;
        while ((raw = in.readLine()) != null) {
            String[] p = raw.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    k = Integer.parseInt(p[2]);
                    c = new RwLock.Steps(k);
                }
                case "step" -> {
                    int t = Integer.parseInt(p[1]) - 1;
                    if (t > k) out.add("none");
                    else if (c.step(t)) out.add(show(c));
                    else out.add(c.waits[t] != null ? "waits" : "done");
                }
                case "run" -> {
                    c = new RwLock.Steps(k);
                    boolean ok = true;
                    for (char d : p[1].toCharArray()) {
                        int t = d - '1';
                        if (t < 0 || t > k || !c.step(t)) {
                            ok = false;
                            break;
                        }
                    }
                    out.add(ok ? show(c) : "stopped");
                }
                case "reset" -> {
                    c = new RwLock.Steps(k);
                    out.add("n=0");
                }
                case "threads" -> {
                    int bad = RwLock.runThreads(k, 200, false) + RwLock.runThreads(k, 200, true);
                    out.add(bad == 0 ? "ok" : "shared");
                }
                default -> { }
            }
        }
        System.out.println(String.join("\n", out));
    }
}
