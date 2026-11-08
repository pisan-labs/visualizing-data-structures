import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;

/**
 * Test driver, one operation per line: "fft a0 a1 ..." prints each output's real and imaginary
 * parts in hundredths, rounded; "multiply a0 a1 ... | b0 b1 ..." prints the product's
 * coefficients.
 */
public class Main {
    static long hundredths(double x) {
        return (long) Math.floor(x * 100 + 0.5);
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].equals("fft")) {
                double[] re = new double[p.length - 1];
                for (int i = 1; i < p.length; i++) re[i - 1] = Double.parseDouble(p[i]);
                double[][] y = Fft.fft(re, new double[re.length], false);
                StringBuilder row = new StringBuilder();
                for (int k = 0; k < re.length; k++) {
                    if (k > 0) row.append(' ');
                    row.append(hundredths(y[0][k])).append(' ').append(hundredths(y[1][k]));
                }
                out.append(row).append('\n');
            } else if (p[0].equals("multiply")) {
                int bar = Arrays.asList(p).indexOf("|");
                long[] a = new long[bar - 1];
                long[] b = new long[p.length - bar - 1];
                for (int i = 0; i < a.length; i++) a[i] = Long.parseLong(p[i + 1]);
                for (int i = 0; i < b.length; i++) b[i] = Long.parseLong(p[bar + 1 + i]);
                long[] c = Fft.multiply(a, b);
                StringBuilder row = new StringBuilder();
                for (int k = 0; k < c.length; k++) row.append(k > 0 ? " " : "").append(c[k]);
                out.append(row).append('\n');
            }
        }
        System.out.print(out);
    }
}
