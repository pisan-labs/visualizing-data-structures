import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: "fib n" prints F(n) bottom-up; "memo n" prints F(n) top-down with a memo. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length != 2) {
                continue;
            }
            int n = Integer.parseInt(parts[1]);
            switch (parts[0]) {
                case "fib" -> out.append(Fibonacci.fib(n)).append('\n');
                case "memo" -> out.append(Fibonacci.fibMemo(n)).append('\n');
                default -> { }
            }
        }
        System.out.print(out);
    }
}
