import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Test driver: reads one operation per line, prints one result per line. Real threads are not
 * deterministic, so the steps are driven one at a time here, and the real threads run one at
 * a time (each joined before the next starts).
 */
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> out = new ArrayList<>();
        int threads = 0, times = 0;
        Race c = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    threads = Integer.parseInt(p[1]);
                    times = Integer.parseInt(p[2]);
                    c = new Race(threads, times);
                }
                case "step" -> {
                    int t = Integer.parseInt(p[1]) - 1;
                    if (t >= threads) out.add("none");
                    else if (c.step(t)) out.add("count=" + c.count + " r=" + c.reg[t]);
                    else out.add("done");
                }
                case "run" -> {
                    c = new Race(threads, times);
                    boolean ok = true;
                    for (char d : p[1].toCharArray()) {
                        int t = d - '1';
                        if (t < 0 || t >= threads || !c.step(t)) {
                            ok = false;
                            break;
                        }
                    }
                    out.add(ok ? "count=" + c.count : "stopped");
                }
                case "every" -> {
                    StringBuilder sb = new StringBuilder();
                    for (Map.Entry<Integer, Long> e : Race.outcomes(c).entrySet()) {
                        if (sb.length() > 0) sb.append(' ');
                        sb.append(e.getKey()).append(':').append(e.getValue());
                    }
                    out.add(sb.toString());
                }
                case "reset" -> {
                    c = new Race(threads, times);
                    out.add("count=0");
                }
                case "threads" -> out.add(String.valueOf(new Race(threads, times).runThreads(true)));
                default -> { }
            }
        }
        System.out.println(String.join("\n", out));
    }
}
