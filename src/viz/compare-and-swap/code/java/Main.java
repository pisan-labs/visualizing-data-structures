import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line. Real threads are not
 * deterministic, so Cas.Steps drives the steps one at a time; "threads" runs real threads with
 * the cas loop, which never lose an update.
 */
public class Main {
    static String show(Cas.Steps c) {
        List<String> r = new ArrayList<>();
        for (int x : c.retries) r.add(String.valueOf(x));
        return "n=" + c.n + " retries=" + String.join(",", r);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> out = new ArrayList<>();
        int k = 2;
        boolean cas = true;
        Cas.Steps c = null;
        String raw;
        while ((raw = in.readLine()) != null) {
            String[] p = raw.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    cas = !p[1].equals("plain");
                    k = Integer.parseInt(p[2]);
                    c = new Cas.Steps(k, cas);
                }
                case "step" -> {
                    int t = Integer.parseInt(p[1]) - 1;
                    if (t >= k) out.add("none");
                    else out.add(c.step(t) ? show(c) : "done");
                }
                case "run" -> {
                    c = new Cas.Steps(k, cas);
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
                    c = new Cas.Steps(k, cas);
                    out.add("n=0");
                }
                case "threads" -> {
                    int n = Integer.parseInt(p[1]), times = 1000;
                    out.add(Cas.runThreads(n, times) == n * times ? "ok" : "lost");
                }
                default -> { }
            }
        }
        System.out.println(String.join("\n", out));
    }
}
