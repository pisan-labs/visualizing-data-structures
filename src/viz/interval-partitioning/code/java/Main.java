import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;

/**
 * Test driver: "rooms s1-f1 s2-f2 ..." prints the number of rooms, then each lecture's room in
 * the order typed.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 2 || !p[0].equals("rooms")) {
                continue;
            }
            int n = p.length - 1;
            int[] start = new int[n];
            int[] finish = new int[n];
            for (int k = 0; k < n; k++) {
                String[] sf = p[k + 1].split("-");
                start[k] = Integer.parseInt(sf[0]);
                finish[k] = Integer.parseInt(sf[1]);
            }
            int[] room = Rooms.assign(start, finish);
            out.append(Arrays.stream(room).max().orElse(0));
            for (int r : room) {
                out.append(' ').append(r);
            }
            out.append('\n');
        }
        System.out.print(out);
    }
}
