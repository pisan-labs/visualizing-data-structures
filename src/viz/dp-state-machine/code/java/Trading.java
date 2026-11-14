import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class Trading {
    private Trading() {}

    static final long NEG = Long.MIN_VALUE / 4; // a state you cannot be in

    /** A trade: "buy" or "sell", on a day counted from 1. */
    public record Trade(String action, int day) {}

    /** The most money and the trades that make it. */
    public record Plan(long profit, List<Trade> trades) {}

    /** Most money from trading one item, holding at most one. */
    public static Plan bestPlan(int[] prices, boolean cooldown, int fee) {
        int n = prices.length;
        long[] free = new long[n + 1]; // holding nothing at the end of day t
        long[] hold = new long[n + 1]; // holding the item
        long[] cool = new long[n + 1]; // sold on day t, so day t + 1 is a rest
        hold[0] = NEG;
        cool[0] = NEG;
        for (int t = 1; t <= n; t++) {
            int p = prices[t - 1];
            hold[t] = Math.max(hold[t - 1], free[t - 1] - p); // keep it, or buy today
            if (cooldown) {
                free[t] = Math.max(free[t - 1], cool[t - 1]); // rest, or rest after a sale
                cool[t] = hold[t - 1] + p - fee; // sell today
            } else {
                free[t] = Math.max(free[t - 1], hold[t - 1] + p - fee); // rest, or sell today
                cool[t] = NEG;
            }
        }
        String state = cooldown && cool[n] > free[n] ? "cool" : "free";
        long best = Math.max(free[n], cool[n]);
        List<Trade> plan = new ArrayList<>();
        for (int t = n; t >= 1; t--) { // walk back: which way in made each value?
            switch (state) {
                case "hold" -> {
                    if (hold[t] != hold[t - 1]) {
                        plan.add(new Trade("buy", t));
                        state = "free";
                    }
                }
                case "cool" -> {
                    plan.add(new Trade("sell", t));
                    state = "hold";
                }
                default -> {
                    if (free[t] != free[t - 1]) {
                        if (cooldown) state = "cool";
                        else {
                            plan.add(new Trade("sell", t));
                            state = "hold";
                        }
                    }
                }
            }
        }
        Collections.reverse(plan);
        return new Plan(best, plan);
    }
}
