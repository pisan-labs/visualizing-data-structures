import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: reads one operation per line, prints one result per line. "load rules" loads a
 * machine (and prints nothing); "run word" prints "accept after 25 moves: xxxyyy", or reject,
 * or still running.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        TuringMachine machine = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split(" ", 2);
            String arg = parts.length > 1 ? parts[1].trim() : "";
            switch (parts[0]) {
                case "load" -> machine = new TuringMachine(arg);
                case "run" -> {
                    TuringMachine.Result r = machine.run(arg, 500);
                    String verdict = r.verdict().equals("running") ? "still running" : r.verdict();
                    String unit = r.moves() == 1 ? "move" : "moves";
                    out.append(verdict + " after " + r.moves() + " " + unit + ": " + r.tape() + "\n");
                }
                default -> {}
            }
        }
        System.out.print(out);
    }
}
