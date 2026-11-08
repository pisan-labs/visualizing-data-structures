public class Fft {
    /** The DFT of (re, im), length a power of 2: the polynomial at the nth roots of unity. */
    public static double[][] fft(double[] re, double[] im, boolean inverse) {
        int n = re.length;
        if (n == 1) return new double[][] {{re[0]}, {im[0]}};
        double[] er = new double[n / 2], ei = new double[n / 2];
        double[] or = new double[n / 2], oi = new double[n / 2];
        for (int i = 0; i < n / 2; i++) {
            er[i] = re[2 * i]; // even positions
            ei[i] = im[2 * i];
            or[i] = re[2 * i + 1]; // odd positions
            oi[i] = im[2 * i + 1];
        }
        double[][] y0 = fft(er, ei, inverse);
        double[][] y1 = fft(or, oi, inverse);
        double[] yr = new double[n], yi = new double[n];
        double sign = inverse ? -1 : 1;
        for (int k = 0; k < n / 2; k++) {
            double angle = sign * 2 * Math.PI * k / n; // omega_n^k = e^(i * angle)
            double wr = Math.cos(angle), wi = Math.sin(angle);
            double tr = wr * y1[0][k] - wi * y1[1][k];
            double ti = wr * y1[1][k] + wi * y1[0][k];
            yr[k] = y0[0][k] + tr;
            yi[k] = y0[1][k] + ti;
            yr[k + n / 2] = y0[0][k] - tr;
            yi[k + n / 2] = y0[1][k] - ti;
        }
        return new double[][] {yr, yi};
    }

    /** The coefficients of a(x) * b(x): evaluate, multiply point by point, interpolate. */
    public static long[] multiply(long[] a, long[] b) {
        int size = a.length + b.length - 1;
        int n = 2;
        while (n < size) n *= 2;
        double[] ar = new double[n], br = new double[n];
        for (int i = 0; i < a.length; i++) ar[i] = a[i];
        for (int i = 0; i < b.length; i++) br[i] = b[i];
        double[][] fa = fft(ar, new double[n], false);
        double[][] fb = fft(br, new double[n], false);
        double[] cr = new double[n], ci = new double[n];
        for (int k = 0; k < n; k++) {
            cr[k] = fa[0][k] * fb[0][k] - fa[1][k] * fb[1][k];
            ci[k] = fa[0][k] * fb[1][k] + fa[1][k] * fb[0][k];
        }
        double[][] c = fft(cr, ci, true);
        long[] out = new long[size];
        for (int k = 0; k < size; k++) out[k] = Math.round(c[0][k] / n);
        return out;
    }
}
