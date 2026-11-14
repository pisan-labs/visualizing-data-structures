import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "ref", "logits",
 * "rewards" (four numbers each) and "critic v" set the state. "rl method eps beta u1..u4" draws
 * a group and updates; it prints the group, the advantages, which samples the last pass
 * clipped, the new policy and v. "dpo beta u..." draws pairs from the reference until their
 * rewards differ, updates, and prints the winner, the loser, h and the new policy.
 */
public class Main {
    static final double LR = 0.5;
    static final int PASSES = 2;

    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String line(double[] xs) {
        StringJoiner out = new StringJoiner(" ");
        for (double x : xs) out.add(three(x));
        return out.toString();
    }

    static double[] numbers(String[] p, int from) {
        double[] out = new double[p.length - from];
        for (int i = from; i < p.length; i++) out[i - from] = Double.parseDouble(p[i]);
        return out;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        double[] zRef = {}, z = {}, rewards = {};
        double v = 0;
        StringBuilder out = new StringBuilder();
        String text;
        while ((text = in.readLine()) != null) {
            String[] p = text.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "ref" -> zRef = numbers(p, 1);
                case "logits" -> z = numbers(p, 1);
                case "rewards" -> rewards = numbers(p, 1);
                case "critic" -> v = Double.parseDouble(p[1]);
                case "rl" -> {
                    String method = p[1];
                    double eps = Double.parseDouble(p[2]), beta = Double.parseDouble(p[3]);
                    double[] us = numbers(p, 4);
                    double[] pOld = Policy.softmax(z), pRef = Policy.softmax(zRef);
                    int[] group = new int[us.length];
                    for (int i = 0; i < us.length; i++) group[i] = Policy.draw(pOld, us[i]);
                    double[][] a = Policy.advantages(method, rewards, group, pOld, pRef, beta, v);
                    boolean[] clipped = new boolean[group.length];
                    int passes = method.equals("reinforce") ? 1 : PASSES;
                    for (int k = 0; k < passes; k++)
                        z = Policy.pass(method, z, pOld, pRef, group, a[0], eps, beta, LR, clipped);
                    // The critic moves halfway to the group's average reward.
                    if (method.equals("ppo")) v = v + 0.5 * (Policy.mean(a[1]) - v);
                    StringJoiner g = new StringJoiner(" ");
                    for (int x : group) g.add(String.valueOf(x));
                    StringBuilder flags = new StringBuilder();
                    for (boolean c : clipped) flags.append(c ? '1' : '0');
                    out.append(g).append(" | ").append(line(a[0])).append(" | ")
                            .append(method.equals("reinforce") ? "-" : flags.toString())
                            .append(" | ").append(line(Policy.softmax(z)))
                            .append(" | ").append(three(v)).append('\n');
                }
                case "dpo" -> {
                    double beta = Double.parseDouble(p[1]);
                    double[] us = numbers(p, 2);
                    double[] pRef = Policy.softmax(zRef);
                    int next = 0;
                    int x = Policy.draw(pRef, us[next++]), y = Policy.draw(pRef, us[next++]);
                    while (rewards[x] == rewards[y]) {
                        x = Policy.draw(pRef, us[next++]);
                        y = Policy.draw(pRef, us[next++]);
                    }
                    int w = rewards[x] > rewards[y] ? x : y, l = w == x ? y : x;
                    z = z.clone();
                    double h = Policy.dpo(z, zRef, w, l, beta, LR);
                    out.append(w).append(' ').append(l).append(" | ").append(three(h))
                            .append(" | ").append(line(Policy.softmax(z))).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
