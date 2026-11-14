import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one line per result. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        MinStack stack = new MinStack();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            if (parts[0].equals("push")) {
                stack.push(Integer.parseInt(parts[1]));
                continue;
            }
            if (stack.isEmpty()) {
                out.append("empty\n");
                continue;
            }
            switch (parts[0]) {
                case "pop" -> out.append(stack.pop()).append('\n');
                case "top" -> out.append(stack.top()).append('\n');
                case "min" -> out.append(stack.getMin()).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
