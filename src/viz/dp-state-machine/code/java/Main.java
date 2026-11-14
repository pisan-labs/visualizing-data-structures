import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: "best c f p1 p2 ..." prints the most money from trading one item at prices
 * p1..pn, with a cooldown when c is 1 and a fee f per sale; "plan c f p1 p2 ..." prints it and
 * the trades ("7 buy 2 sell 4"), or "0 none" when no trade pays.
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 4) continue;
            int[] prices = new int[p.length - 3];
            for (int i = 3; i < p.length; i++) prices[i - 3] = Integer.parseInt(p[i]);
            Trading.Plan plan = Trading.bestPlan(prices, p[1].equals("1"), Integer.parseInt(p[2]));
            StringBuilder out = new StringBuilder().append(plan.profit());
            if (p[0].equals("plan")) {
                if (plan.trades().isEmpty()) out.append(" none");
                for (Trading.Trade t : plan.trades()) out.append(' ').append(t.action()).append(' ').append(t.day());
            }
            System.out.println(out);
        }
    }
}
