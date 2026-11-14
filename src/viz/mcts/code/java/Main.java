import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "node <parent> <word>
 * <reward>" adds a node (parent -1 for the root, reward - for a word that is not the last);
 * "reset" empties the search. "iterate <c> <u...>" runs one iteration with these random numbers
 * and prints the path, the leaf and its reward, then n and W of each child of the root. "move"
 * prints the most visited child.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        List<Mcts.Node> nodes = new ArrayList<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "node" -> {
                    int k = Integer.parseInt(p[1]);
                    Mcts.Node parent = k >= 0 ? nodes.get(k) : null;
                    double r = p[3].equals("-") ? 0 : Double.parseDouble(p[3]);
                    Mcts.Node node = new Mcts.Node(p[2], parent, r);
                    if (parent != null) parent.children.add(node);
                    nodes.add(node);
                }
                case "reset" -> {
                    for (Mcts.Node v : nodes) {
                        v.n = 0;
                        v.w = 0;
                        v.tried = 0;
                    }
                }
                case "iterate" -> {
                    double c = Double.parseDouble(p[1]);
                    int[] next = {2};
                    List<Mcts.Node> path =
                            Mcts.iterate(nodes.get(0), c, () -> Double.parseDouble(p[next[0]++]));
                    Mcts.Node leaf = path.remove(path.size() - 1);
                    StringJoiner words = new StringJoiner(" ");
                    for (Mcts.Node v : path.subList(1, path.size())) words.add(v.word);
                    StringJoiner kids = new StringJoiner(" ");
                    for (Mcts.Node ch : nodes.get(0).children) kids.add(ch.n + " " + three(ch.w));
                    out.append(words).append(" > ").append(leaf.word).append(' ')
                            .append(three(leaf.reward)).append(" | ").append(kids).append('\n');
                }
                case "move" -> out.append("move ").append(Mcts.bestMove(nodes.get(0)).word).append('\n');
                default -> { }
            }
        }
        System.out.print(out);
    }
}
