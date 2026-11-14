import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Test driver: reads one operation per line, prints one line per result. "random i" makes the
 * random pick return index i, so the output can be checked.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        Deque<Integer> picks = new ArrayDeque<>();
        RandomizedSet set = new RandomizedSet(n -> picks.pop());
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "insert" -> out.append(set.insert(Integer.parseInt(parts[1]))).append('\n');
                case "remove" -> out.append(set.remove(Integer.parseInt(parts[1]))).append('\n');
                case "random" -> {
                    if (set.size() == 0) {
                        out.append("empty\n");
                    } else {
                        picks.push(Integer.parseInt(parts[1]));
                        out.append(set.getRandom()).append('\n');
                    }
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
