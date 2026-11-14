import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Test driver: reads one operation per line, prints one result per line. Real threads are not
 * deterministic, so Semaphores.Room drives the steps one at a time; "threads" runs a pattern
 * on real threads, where the semaphores fix the result.
 */
public class Main {
    static String show(Semaphores.Room r) {
        String line = r.line.stream().map(t -> "T" + (t + 1)).collect(Collectors.joining(","));
        String out = String.join(",", r.out);
        return "s=" + r.s + " line=" + (line.isEmpty() ? "-" : line) + " out=" + (out.isEmpty() ? "-" : out);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> out = new ArrayList<>();
        int room = 0;
        Semaphores.Room r = null;
        String raw;
        while ((raw = in.readLine()) != null) {
            String[] p = raw.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    room = Integer.parseInt(p[1]);
                    r = new Semaphores.Room(room);
                }
                case "step" -> {
                    int t = Integer.parseInt(p[1]) - 1;
                    if (t >= 3) out.add("none");
                    else if (r.step(t)) out.add(show(r));
                    else out.add(r.line.contains(t) ? "waits" : "done");
                }
                case "run" -> {
                    r = new Semaphores.Room(room);
                    boolean ok = true;
                    for (char d : p[1].toCharArray()) {
                        int t = d - '1';
                        if (t < 0 || t >= 3 || !r.step(t)) {
                            ok = false;
                            break;
                        }
                    }
                    out.add(ok ? show(r) : "stopped");
                }
                case "reset" -> {
                    r = new Semaphores.Room(room);
                    out.add("s=" + room);
                }
                case "threads" -> {
                    int k = Integer.parseInt(p[2]);
                    switch (p[1]) {
                        case "limit" -> out.add(Semaphores.limit(3, k) <= k ? "ok" : "too many");
                        case "first" -> out.add(String.join(" ", Semaphores.first()));
                        default -> out.add(String.join(" ", Semaphores.turns(2)));
                    }
                }
                default -> { }
            }
        }
        System.out.println(String.join("\n", out));
    }
}
