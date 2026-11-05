import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Test driver: reads one statement per line and prints the variables after each one. */
public class Main {
    private static final Pattern APPEND = Pattern.compile("(\\w+)\\.append\\((-?\\d+)\\)");
    private static final Pattern SET = Pattern.compile("(\\w+)\\[(\\d+)\\] = (-?\\d+)");
    private static final Pattern CALL = Pattern.compile("(\\w+)\\((\\w+)\\)");
    private static final Pattern LIST = Pattern.compile("(\\w+) = \\[(.*)\\]");
    private static final Pattern NUM = Pattern.compile("(\\w+) = (-?\\d+)");
    private static final Pattern COPY = Pattern.compile("(\\w+) = (\\w+)");

    @SuppressWarnings("unchecked")
    private static List<Integer> list(Object o) {
        return (List<Integer>) o;
    }

    private static String show(Map<String, Object> env) {
        if (env.isEmpty()) return "(empty)";
        return env.entrySet().stream()
                .map(e -> e.getKey() + "=" + (e.getValue() instanceof List<?> l
                        ? "[" + l.stream().map(String::valueOf).collect(Collectors.joining(",")) + "]"
                        : e.getValue()))
                .collect(Collectors.joining(" "));
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        Map<String, Object> env = new LinkedHashMap<>();
        String line;
        while ((line = in.readLine()) != null) {
            String s = line.trim();
            if (s.isEmpty()) continue;
            Matcher m;
            if (s.equals("clear")) {
                env.clear();
            } else if ((m = APPEND.matcher(s)).matches()) {
                list(env.get(m.group(1))).add(Integer.parseInt(m.group(2)));
            } else if ((m = SET.matcher(s)).matches()) {
                list(env.get(m.group(1))).set(Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
            } else if ((m = CALL.matcher(s)).matches()) {
                Object arg = env.get(m.group(2));
                switch (m.group(1)) {
                    case "grow" -> Aliasing.grow(list(arg));
                    case "reset" -> Aliasing.reset(list(arg));
                    case "bump" -> Aliasing.bump((Integer) arg);
                    default -> throw new IllegalArgumentException("unknown function " + m.group(1));
                }
            } else if ((m = LIST.matcher(s)).matches()) {
                List<Integer> xs = new ArrayList<>();
                for (String x : m.group(2).split(", ")) {
                    if (!x.isEmpty()) xs.add(Integer.parseInt(x));
                }
                env.put(m.group(1), xs);
            } else if ((m = NUM.matcher(s)).matches()) {
                env.put(m.group(1), Integer.parseInt(m.group(2)));
            } else if ((m = COPY.matcher(s)).matches()) {
                env.put(m.group(1), env.get(m.group(2))); // copies the reference
            }
            out.append(show(env)).append('\n');
        }
        System.out.print(out);
    }
}
