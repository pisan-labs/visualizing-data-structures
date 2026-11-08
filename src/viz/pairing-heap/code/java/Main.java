import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static final int CAPACITY = 31; // the page draws at most this many keys

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        PairingHeap heap = new PairingHeap();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int[] args = new int[parts.length - 1];
            for (int k = 1; k < parts.length; k++) args[k - 1] = Integer.parseInt(parts[k]);
            switch (parts[0]) {
                case "insert" -> {
                    if (heap.size() >= CAPACITY) out.append("full\n");
                    else {
                        heap.insert(args[0]);
                        out.append(heap.size()).append('\n');
                    }
                }
                case "deleteMin" -> {
                    try {
                        out.append(heap.deleteMin()).append('\n');
                    } catch (NoSuchElementException e) {
                        out.append("empty\n");
                    }
                }
                case "decrease" -> {
                    PairingHeap.Node x = heap.find(args[0]);
                    if (x == null) out.append("missing\n");
                    else {
                        try {
                            heap.decreaseKey(x, args[1]);
                            out.append("ok\n");
                        } catch (IllegalArgumentException e) {
                            out.append("larger\n");
                        }
                    }
                }
                case "meld" -> {
                    if (heap.size() + args.length > CAPACITY) out.append("full\n");
                    else {
                        PairingHeap other = new PairingHeap();
                        for (int k : args) other.insert(k);
                        heap.meldWith(other);
                        out.append(heap.size()).append('\n');
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
