import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        LeftistHeap heap = new LeftistHeap();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "insert" -> {
                    heap.insert(Integer.parseInt(parts[1]));
                    out.append(heap.size()).append('\n');
                }
                case "deletemin" -> {
                    try {
                        out.append(heap.deleteMin()).append('\n');
                    } catch (NoSuchElementException e) {
                        out.append("empty\n");
                    }
                }
                case "merge" -> {
                    LeftistHeap other = new LeftistHeap();
                    for (int k = 1; k < parts.length; k++) other.insert(Integer.parseInt(parts[k]));
                    heap.mergeWith(other);
                    out.append(heap.size()).append('\n');
                }
                case "clear" -> {
                    heap.clear();
                    out.append("ok\n");
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
