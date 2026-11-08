import java.io.*;

/**
 * Test driver: reads one operation per line, prints one result per line.
 *   machine anbncn | power2 | double   which machine runs
 *   run aabbcc                         prints "accept 23", "reject 4" or "blocked 3"
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Lba m = Lba.ANBNCN;
        for (String line; (line = in.readLine()) != null; ) {
            String[] w = line.trim().split(" ", 2);
            switch (w[0]) {
                case "machine" -> m = switch (w[1]) {
                    case "power2" -> Lba.POWER2;
                    case "double" -> Lba.DOUBLE;
                    default -> Lba.ANBNCN;
                };
                case "run" -> System.out.println(m.run(w[1].equals("eps") ? "" : w[1], 1000));
                default -> { }
            }
        }
    }
}
