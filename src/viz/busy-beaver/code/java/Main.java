import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: reads one operation per line, prints one result per line.
 * load <rules> loads a machine such as 1RB1LB_1LA1RH on a blank tape (prints nothing);
 * reset gives a blank tape again (prints nothing); run <k> makes up to k moves and prints
 * "<state> <moves> <ones>".
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        BusyBeaver machine = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] w = line.trim().split(" ", 2);
            switch (w[0]) {
                case "load" -> machine = new BusyBeaver(w[1]);
                case "reset" -> machine.reset();
                case "run" -> {
                    machine.run(Long.parseLong(w[1]));
                    System.out.println(machine.state() + " " + machine.moves() + " " + machine.ones());
                }
                default -> { }
            }
        }
    }
}
