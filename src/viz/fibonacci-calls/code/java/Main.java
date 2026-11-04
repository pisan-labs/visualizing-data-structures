import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashMap;

/** Test driver: reads "fib n" or "memo n", one per line, and prints the value and the calls. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int n = Integer.parseInt(parts[1]);
            Fibonacci.calls = 0;
            long value = switch (parts[0]) {
                case "fib" -> Fibonacci.fib(n);
                case "memo" -> Fibonacci.fibMemo(n, new HashMap<>());
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            };
            out.append(value).append(' ').append(Fibonacci.calls).append('\n');
        }
        System.out.print(out);
    }
}
