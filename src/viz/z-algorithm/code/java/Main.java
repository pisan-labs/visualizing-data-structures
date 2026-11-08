import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/** Test driver: "zarray S" prints z; "search T P" prints the shifts, or "none". */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length == 2 && parts[0].equals("zarray")) {
                int[] z = ZAlgorithm.zArray(parts[1]);
                String values =
                        Arrays.stream(z).mapToObj(String::valueOf).collect(Collectors.joining(" "));
                out.append(values).append('\n');
            } else if (parts.length == 3 && parts[0].equals("search")) {
                List<Integer> found = ZAlgorithm.search(parts[1], parts[2]);
                String shifts = found.stream().map(String::valueOf).collect(Collectors.joining(" "));
                out.append(found.isEmpty() ? "none" : shifts).append('\n');
            }
        }
        System.out.print(out);
    }
}
