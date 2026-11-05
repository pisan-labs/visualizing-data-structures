import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    List<String> names = new ArrayList<>();
    Map<String, Integer> index = new HashMap<>();
    List<int[]> clauses = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "vars" -> {
          names = List.of(p).subList(1, p.length);
          index = new HashMap<>();
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          clauses = new ArrayList<>();
        }
        case "clause" -> {
          int[] c = new int[2];
          for (int k = 0; k < 2; k++) {
            boolean neg = p[k + 1].startsWith("!");
            c[k] = 2 * index.get(neg ? p[k + 1].substring(1) : p[k + 1]) + (neg ? 1 : 0);
          }
          clauses.add(c);
        }
        case "solve" -> {
          boolean[] value = TwoSat.solve(names.size(), clauses);
          if (value == null) {
            out.append("UNSAT\n");
          } else {
            StringJoiner all = new StringJoiner(" ");
            for (int i = 0; i < value.length; i++)
              all.add(names.get(i) + "=" + (value[i] ? "T" : "F"));
            out.append(all).append('\n');
          }
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
