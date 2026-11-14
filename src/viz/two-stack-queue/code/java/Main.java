import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one line per result. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        TwoStackQueue queue = new TwoStackQueue();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            if (parts[0].equals("enqueue")) {
                queue.enqueue(Integer.parseInt(parts[1]));
                continue;
            }
            if (queue.size() == 0) {
                out.append("empty\n");
                continue;
            }
            switch (parts[0]) {
                case "dequeue" -> out.append(queue.dequeue()).append('\n');
                case "peek" -> out.append(queue.peek()).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
