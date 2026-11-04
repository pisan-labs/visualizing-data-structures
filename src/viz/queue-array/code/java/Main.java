import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        CircularQueue<String> queue = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "new" -> queue = new CircularQueue<>(Integer.parseInt(parts[1]));
                case "enqueue" -> {
                    try {
                        queue.enqueue(parts[1]);
                        out.append("ok\n");
                    } catch (IllegalStateException e) {
                        out.append("overflow\n");
                    }
                }
                case "dequeue" -> {
                    try {
                        out.append(queue.dequeue()).append('\n');
                    } catch (NoSuchElementException e) {
                        out.append("underflow\n");
                    }
                }
                case "peek" -> {
                    try {
                        out.append(queue.peek()).append('\n');
                    } catch (NoSuchElementException e) {
                        out.append("empty\n");
                    }
                }
                case "clear" -> {
                    queue.clear();
                    out.append("ok\n");
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
