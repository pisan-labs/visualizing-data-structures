import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  static Object convert(Object m) {
    return m instanceof Moore moore ? moore.toMealy() : ((Mealy) m).toMoore();
  }

  static String run(Object m, String word) {
    String w = m instanceof Moore moore ? moore.run(word) : ((Mealy) m).run(word);
    return w.isEmpty() ? "-" : w;
  }

  static String show(Object m) {
    List<String> parts = new ArrayList<>();
    if (m instanceof Moore moore) {
      new TreeMap<>(moore.out).forEach((q, o) -> parts.add(q + "/" + o));
      List<String> moves = new ArrayList<>();
      new TreeMap<>(moore.delta).forEach((p, row) ->
          new TreeMap<>(row).forEach((c, q) -> moves.add(p + "-" + c + "->" + q)));
      return "moore start=" + moore.start + " | " + String.join(" ", parts) + " | "
          + String.join(" ", moves);
    }
    Mealy mealy = (Mealy) m;
    new TreeMap<>(mealy.delta).forEach((p, row) -> new TreeMap<>(row).forEach((c, q) ->
        parts.add(p + "-" + c + "/" + mealy.out.get(p).get(c) + "->" + q)));
    return "mealy start=" + mealy.start + " | " + String.join(" ", parts);
  }

  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    String kind = null;
    String start = null;
    List<String> states = new ArrayList<>();
    Map<String, Map<Character, String>> delta = new HashMap<>();
    Map<String, String> stateOut = new HashMap<>();
    Map<String, Map<Character, String>> moveOut = new HashMap<>();
    Object machine = null;
    Object result = null;
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "mealy", "moore" -> {
          kind = p[0];
          states = List.of(p).subList(1, p.length);
          start = null;
          delta = new HashMap<>();
          stateOut = new HashMap<>();
          moveOut = new HashMap<>();
          machine = null;
          result = null;
        }
        case "start" -> start = p[1];
        case "out" -> stateOut.put(p[1], p[2]);
        case "move" -> {
          delta.computeIfAbsent(p[1], k -> new HashMap<>()).put(p[2].charAt(0), p[3]);
          if (p.length > 4) moveOut.computeIfAbsent(p[1], k -> new HashMap<>()).put(p[2].charAt(0), p[4]);
        }
        case "run", "convert", "back" -> {
          if (machine == null) {
            machine = kind.equals("moore")
                ? new Moore(states, start, delta, stateOut)
                : new Mealy(states, start, delta, moveOut);
          }
          if (p[0].equals("run")) {
            String word = p.length > 1 ? p[1] : "";
            out.append(run(machine, word));
            if (result != null) out.append(" | ").append(run(result, word));
            out.append('\n');
          } else {
            if (p[0].equals("back")) machine = result;
            result = convert(machine);
            out.append(show(result)).append('\n');
          }
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
