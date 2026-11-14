import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: "most s-f ..." prints the most intervals open at once; "skyline s-f:h ..."
 * prints the skyline's key points as x,h separated by spaces.
 */
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        for (String line; (line = in.readLine()) != null; ) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            int[][] items = new int[p.length - 1][];
            for (int k = 1; k < p.length; k++) {
                String[] q = p[k].split("[-:]");
                items[k - 1] = new int[q.length];
                for (int j = 0; j < q.length; j++) items[k - 1][j] = Integer.parseInt(q[j]);
            }
            switch (p[0]) {
                case "most" -> out.append(Sweep.mostOpen(items)).append('\n');
                case "skyline" -> {
                    StringJoiner j = new StringJoiner(" ");
                    for (int[] kp : Sweep.skyline(items)) j.add(kp[0] + "," + kp[1]);
                    out.append(j).append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}
