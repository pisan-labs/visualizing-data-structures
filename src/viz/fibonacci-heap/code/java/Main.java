import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        FibonacciHeap heap = new FibonacciHeap();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int[] args = new int[parts.length - 1];
            for (int k = 1; k < parts.length; k++) args[k - 1] = Integer.parseInt(parts[k]);
            switch (parts[0]) {
                case "insert" -> {
                    heap.insert(args[0]);
                    out.append(heap.size()).append('\n');
                }
                case "findmin", "deletemin" -> {
                    try {
                        int key = parts[0].equals("findmin") ? heap.minimum() : heap.extractMin();
                        out.append(key).append('\n');
                    } catch (NoSuchElementException e) {
                        out.append("empty\n");
                    }
                }
                case "union" -> {
                    FibonacciHeap other = new FibonacciHeap();
                    for (int key : args) other.insert(key);
                    heap.mergeWith(other);
                    out.append(heap.size()).append('\n');
                }
                case "decrease", "delete" -> {
                    FibonacciHeap.Node node = heap.find(args[0]);
                    if (node == null) {
                        out.append("missing\n");
                    } else if (parts[0].equals("delete")) {
                        heap.delete(node);
                        out.append("ok\n");
                    } else {
                        try {
                            heap.decreaseKey(node, args[1]);
                            out.append("ok\n");
                        } catch (IllegalArgumentException e) {
                            out.append("bigger\n");
                        }
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
