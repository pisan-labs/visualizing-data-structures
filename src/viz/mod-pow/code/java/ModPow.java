public class ModPow {
    /** a^b mod m by square-and-multiply, reading the bits of b from the left. */
    public static long modPow(long a, long b, long m) {
        long d = 1 % m;
        for (char bit : Long.toBinaryString(b).toCharArray()) {
            d = d * d % m; // doubles the exponent so far
            if (bit == '1') {
                d = d * a % m; // adds one to it
            }
        }
        return d;
    }
}
