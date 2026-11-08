import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        MinMaxHeap heap = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int[] args = new int[parts.length - 1];
            for (int k = 1; k < parts.length; k++) args[k - 1] = Integer.parseInt(parts[k]);
            switch (parts[0]) {
                case "new" -> heap = new MinMaxHeap(args[0]);
                case "insert" -> {
                    try {
                        heap.insert(args[0]);
                        out.append(heap.size()).append('\n');
                    } catch (IllegalStateException e) {
                        out.append("overflow\n");
                    }
                }
                case "extractMin", "extractMax" -> {
                    try {
                        int x = parts[0].equals("extractMin") ? heap.extractMin() : heap.extractMax();
                        out.append(x).append('\n');
                    } catch (NoSuchElementException e) {
                        out.append("empty\n");
                    }
                }
                case "build" -> {
                    heap.build(args);
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
