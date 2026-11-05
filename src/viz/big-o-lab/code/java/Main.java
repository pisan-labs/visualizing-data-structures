import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (!parts[0].equals("count")) continue;
            int n = Integer.parseInt(parts[2]);
            long steps = switch (parts[1]) {
                case "constant" -> Growth.constant(n);
                case "logarithmic" -> Growth.logarithmic(n);
                case "linear" -> Growth.linear(n);
                case "linearithmic" -> Growth.linearithmic(n);
                case "quadratic" -> Growth.quadratic(n);
                case "exponential" -> Growth.exponential(n);
                case "factorial" -> Growth.factorial(n);
                default -> throw new IllegalArgumentException("unknown function " + parts[1]);
            };
            out.append(steps).append('\n');
        }
        System.out.print(out);
    }
}
