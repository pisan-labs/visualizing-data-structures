import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        LinkedQueue<String> queue = new LinkedQueue<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "enqueue" -> {
                    queue.enqueue(parts[1]);
                    out.append("ok\n");
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
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
