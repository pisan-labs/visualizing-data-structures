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

    private static String add(Runnable op) {
        try {
            op.run();
            return "ok";
        } catch (IllegalStateException e) {
            return "overflow";
        }
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        ArrayDeque<String> deque = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            ArrayDeque<String> d = deque;
            String result = switch (parts[0]) {
                case "new" -> {
                    deque = new ArrayDeque<>(Integer.parseInt(parts[1]));
                    yield null;
                }
                case "addFirst" -> add(() -> d.addFirst(parts[1]));
                case "addLast" -> add(() -> d.addLast(parts[1]));
                case "removeFirst" -> take(d::removeFirst, "underflow");
                case "removeLast" -> take(d::removeLast, "underflow");
                case "peekFirst" -> take(d::peekFirst, "empty");
                case "peekLast" -> take(d::peekLast, "empty");
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            };
            if (result != null) out.append(result).append('\n');
        }
        System.out.print(out);
    }
}
