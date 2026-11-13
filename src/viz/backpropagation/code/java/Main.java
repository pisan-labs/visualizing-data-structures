import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Test driver: reads one operation per line, prints one result per line. "clear" starts an
 * expression, "var name value" adds a variable and "op name kind operands [power]" a node
 * (operands are names or numbers). "forward" prints f. "backward" builds the graph afresh from
 * the variables, runs the backward pass and prints f and each variable's gradient; the
 * variables keep their gradients until "zero".
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static Value build(Map<String, Value> leaves, List<String[]> recipe) {
        Map<String, Value> vals = new HashMap<>(leaves);
        Value out = null;
        for (String[] r : recipe) {
            Value x = get(vals, r[2]);
            out = switch (r[1]) {
                case "add" -> x.add(get(vals, r[3]));
                case "sub" -> x.sub(get(vals, r[3]));
                case "mul" -> x.mul(get(vals, r[3]));
                case "div" -> x.div(get(vals, r[3]));
                case "neg" -> x.neg();
                case "pow" -> x.pow(Integer.parseInt(r[3]));
                case "tanh" -> x.tanh();
                case "relu" -> x.relu();
                case "exp" -> x.exp();
                case "sigmoid" -> x.sigmoid();
                default -> throw new IllegalArgumentException("unknown node " + r[1]);
            };
            vals.put(r[0], out);
        }
        return out;
    }

    static Value get(Map<String, Value> vals, String t) {
        return Character.isLetter(t.charAt(0)) ? vals.get(t) : new Value(Double.parseDouble(t));
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Map<String, Value> leaves = new LinkedHashMap<>();
        List<String[]> recipe = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "clear" -> {
                    leaves.clear();
                    recipe.clear();
                }
                case "var" -> leaves.put(p[1], new Value(Double.parseDouble(p[2])));
                case "op" -> {
                    String[] r = new String[p.length - 1];
                    System.arraycopy(p, 1, r, 0, r.length);
                    recipe.add(r);
                }
                case "zero" -> leaves.values().forEach(v -> v.grad = 0);
                case "forward" -> out.append("f ").append(three(build(leaves, recipe).data)).append('\n');
                case "backward" -> {
                    Value f = build(leaves, recipe);
                    f.backward();
                    out.append("f ").append(three(f.data)).append(" |");
                    leaves.forEach((name, v) -> out.append(' ').append(name).append(' ').append(three(v.grad)));
                    out.append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
