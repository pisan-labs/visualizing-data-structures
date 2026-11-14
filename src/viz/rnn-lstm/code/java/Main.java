import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "model rnn <w>",
 * "model lstm" or "model lstm97" starts a new sentence; "x <four numbers>" reads one word and
 * prints h and the pull (RNN), or f i g c o h and the pull (LSTM), three decimals each.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        Recurrent net = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].equals("model")) {
                net = new Recurrent(p[1], p.length > 2 ? Double.parseDouble(p[2]) : 0.8);
            } else if (p[0].equals("x")) {
                double[] x = new double[p.length - 1];
                for (int t = 1; t < p.length; t++) x[t - 1] = Double.parseDouble(p[t]);
                StringJoiner j = new StringJoiner(" ");
                for (double v : net.read(x)) j.add(three(v));
                out.append(j).append('\n');
            }
        }
        System.out.print(out);
    }
}
