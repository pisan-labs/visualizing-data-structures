import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one line per result. "settings slots policy"
 * starts an empty server and "add name arrival prompt length" adds a request; neither prints.
 * "step" runs one iteration and prints "t: who is in each slot (- when idle) | who returned (-
 * for no one)"; "run" runs until every request is done and prints the lines of all those
 * iterations joined by " / ".
 */
public class Main {
    static String line(Scheduler s, Scheduler.Iteration it) {
        StringJoiner slots = new StringJoiner(" ");
        for (Scheduler.Request r : it.ran()) slots.add(r == null ? "-" : r.name);
        List<String> back = new ArrayList<>();
        for (Scheduler.Request r : it.returned()) back.add(r.name);
        back.sort(null);
        return (s.clock - 1) + ": " + slots + " | " + (back.isEmpty() ? "-" : String.join(" ", back));
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Scheduler s = null;
        StringBuilder out = new StringBuilder();
        String text;
        while ((text = in.readLine()) != null) {
            String[] p = text.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "settings" -> s = new Scheduler(Integer.parseInt(p[1]), p[2]);
                case "add" -> s.add(new Scheduler.Request(p[1], Integer.parseInt(p[2]),
                        Integer.parseInt(p[3]), Integer.parseInt(p[4])));
                case "step" -> out.append(line(s, s.step())).append('\n');
                case "run" -> {
                    StringJoiner lines = new StringJoiner(" / ");
                    while (s.busy()) lines.add(line(s, s.step()));
                    out.append(lines).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
