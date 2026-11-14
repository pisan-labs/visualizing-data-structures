import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line. Real threads are not
 * deterministic, so Dining.Table drives the steps one at a time; "threads" runs real philosophers
 * with each fix, which always all eat.
 */
public class Main {
    static String name(Integer t) {
        return t == null ? "-" : "P" + (t + 1);
    }

    static String show(Dining.Table c) {
        List<String> forks = new ArrayList<>(), waiting = new ArrayList<>(), ate = new ArrayList<>();
        for (Integer h : c.holder) forks.add(name(h));
        for (int t = 0; t < c.n; t++) if (c.waits[t] != null) waiting.add("P" + (t + 1) + ":" + c.waits[t]);
        for (int t : c.ate) ate.add(name(t));
        return "forks=" + String.join(",", forks) + " waiting=" + (waiting.isEmpty() ? "-" : String.join(",", waiting))
                + " ate=" + (ate.isEmpty() ? "-" : String.join(",", ate))
                + (c.fix.equals("waiter") ? " waiter=" + c.seats : "");
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> out = new ArrayList<>();
        int n = 3;
        String fix = "none";
        Dining.Table c = null;
        String raw;
        while ((raw = in.readLine()) != null) {
            String[] p = raw.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    n = Integer.parseInt(p[1]);
                    fix = p[2];
                    c = new Dining.Table(n, fix);
                }
                case "step" -> {
                    int t = Integer.parseInt(p[1]) - 1;
                    if (t >= n) out.add("none");
                    else if (c.step(t)) out.add(show(c));
                    else out.add(c.waits[t] != null ? "waits" : "done");
                }
                case "run" -> {
                    c = new Dining.Table(n, fix);
                    boolean ok = true;
                    for (char d : p[1].toCharArray()) {
                        int t = d - '1';
                        if (t < 0 || t >= n || !c.step(t)) {
                            ok = false;
                            break;
                        }
                    }
                    out.add(ok ? show(c) : "stopped");
                }
                case "reset" -> {
                    c = new Dining.Table(n, fix);
                    out.add("free");
                }
                case "threads" -> {
                    int meals = 200;
                    boolean fed = true;
                    for (String f : new String[] {"order", "waiter"})
                        for (int m : Dining.dine(n, meals, f)) fed &= m == meals;
                    out.add(fed ? "fed" : "hungry");
                }
                default -> { }
            }
        }
        System.out.println(String.join("\n", out));
    }
}
