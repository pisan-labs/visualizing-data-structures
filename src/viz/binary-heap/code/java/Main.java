import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        MaxHeap heap = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int[] args = new int[parts.length - 1];
            for (int k = 1; k < parts.length; k++) args[k - 1] = Integer.parseInt(parts[k]);
            switch (parts[0]) {
                case "new" -> heap = new MaxHeap(args[0]);
                case "insert" -> {
                    try {
                        heap.insert(args[0]);
                        out.append(heap.size()).append('\n');
                    } catch (IllegalStateException e) {
                        out.append("overflow\n");
                    }
                }
                case "extract" -> {
                    try {
                        out.append(heap.extractMax()).append('\n');
                    } catch (NoSuchElementException e) {
                        out.append("empty\n");
                    }
                }
                case "peek" -> {
                    try {
                        out.append(heap.maximum()).append('\n');
                    } catch (NoSuchElementException e) {
                        out.append("empty\n");
                    }
                }
                case "build" -> {
                    heap.build(args);
                    out.append(heap.size()).append('\n');
                }
                case "update" -> {
                    try {
                        heap.updateKey(args[0], args[1]);
                        out.append("ok\n");
                    } catch (IndexOutOfBoundsException e) {
                        out.append("invalid\n");
                    }
                }
                case "delete" -> {
                    try {
                        out.append(heap.delete(args[0])).append('\n');
                    } catch (IndexOutOfBoundsException e) {
                        out.append("invalid\n");
                    }
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
