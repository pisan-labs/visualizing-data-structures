import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static final int MAX_BLOCKS = 8; // the page draws at most this many

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        MerkleTree tree = new MerkleTree(new ArrayList<>());
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            List<String> args = Arrays.asList(parts).subList(1, parts.length);
            switch (parts[0]) {
                case "build" -> {
                    tree = new MerkleTree(args);
                    out.append(tree.root()).append('\n');
                }
                case "update" -> {
                    try {
                        tree.update(Integer.parseInt(args.get(0)), args.get(1));
                        out.append(tree.root()).append('\n');
                    } catch (IndexOutOfBoundsException e) {
                        out.append("invalid\n");
                    }
                }
                case "append" -> {
                    if (tree.blocks.size() >= MAX_BLOCKS) out.append("full\n");
                    else {
                        tree.append(args.get(0));
                        out.append(tree.root()).append('\n');
                    }
                }
                case "prove" -> {
                    try {
                        List<String> items = new ArrayList<>();
                        for (MerkleTree.Item it : tree.proof(Integer.parseInt(args.get(0))))
                            items.add(it.side() + ":" + it.hash());
                        out.append(items.isEmpty() ? "-" : String.join(" ", items)).append('\n');
                    } catch (IndexOutOfBoundsException e) {
                        out.append("invalid\n");
                    }
                }
                case "verify" -> {
                    try {
                        List<MerkleTree.Item> proof = tree.proof(Integer.parseInt(args.get(0)));
                        boolean ok = MerkleTree.verify(args.get(1), proof, tree.root());
                        out.append(ok ? "ok\n" : "bad\n");
                    } catch (IndexOutOfBoundsException e) {
                        out.append("invalid\n");
                    }
                }
                case "clear" -> {
                    tree = new MerkleTree(new ArrayList<>());
                    out.append("ok\n");
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
