import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;
import java.util.function.Supplier;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    private static String take(Supplier<String> op, String error) {
        try {
            return op.get();
        } catch (NoSuchElementException e) {
            return error;
        }
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        LinkedDeque<String> deque = new LinkedDeque<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            String result = switch (parts[0]) {
                case "addFirst" -> {
                    deque.addFirst(parts[1]);
                    yield "ok";
                }
                case "addLast" -> {
                    deque.addLast(parts[1]);
                    yield "ok";
                }
                case "removeFirst" -> take(deque::removeFirst, "underflow");
                case "removeLast" -> take(deque::removeLast, "underflow");
                case "peekFirst" -> take(deque::peekFirst, "empty");
                case "peekLast" -> take(deque::peekLast, "empty");
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            };
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}
