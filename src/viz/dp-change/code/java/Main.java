import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.List;

/**
 * Test driver: "coins c1 c2 ..." sets the coins. "change a" prints the number of coins and the
 * coins themselves ("none" if a cannot be made); "ways a" prints the number of ways to make a.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        int[] coins = new int[0];
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            switch (parts[0]) {
                case "coins" -> coins = Arrays.stream(parts, 1, parts.length)
                        .mapToInt(Integer::parseInt)
                        .toArray();
                case "change" -> {
                    List<Integer> paid = Change.fewestCoins(coins, Integer.parseInt(parts[1]));
                    if (paid == null) {
                        out.append("none");
                    } else {
                        out.append(paid.size());
                        for (int c : paid) {
                            out.append(' ').append(c);
                        }
                    }
                    out.append('\n');
                }
                case "ways" -> out.append(Change.countWays(coins, Integer.parseInt(parts[1])))
                        .append('\n');
                default -> { }
            }
        }
        System.out.print(out);
    }
}
