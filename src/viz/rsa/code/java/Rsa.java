import java.math.BigInteger;

/** Toy RSA: the arithmetic is right, but numbers this small are broken in a blink. */
public class Rsa {
    public final long n, e, d;

    /** Keys from distinct primes p and q, with the smallest e that works. */
    public Rsa(long p, long q) {
        this(p, q, smallestE((p - 1) * (q - 1)));
    }

    public Rsa(long p, long q, long e) {
        long phi = (p - 1) * (q - 1);
        BigInteger big = BigInteger.valueOf(e);
        if (!big.gcd(BigInteger.valueOf(phi)).equals(BigInteger.ONE)) {
            throw new IllegalArgumentException("e must be coprime to phi");
        }
        this.n = p * q;
        this.e = e;
        // The inverse of e mod phi (BigInteger uses extended Euclid).
        this.d = big.modInverse(BigInteger.valueOf(phi)).longValue();
    }

    static long smallestE(long phi) {
        long e = 2;
        while (BigInteger.valueOf(e).gcd(BigInteger.valueOf(phi)).longValue() != 1) e++;
        return e;
    }

    /** c = m^e mod n, for 0 <= m < n, by square-and-multiply. */
    public long encrypt(long m) {
        return BigInteger.valueOf(m).modPow(BigInteger.valueOf(e), BigInteger.valueOf(n)).longValue();
    }

    /** m = c^d mod n. */
    public long decrypt(long c) {
        return BigInteger.valueOf(c).modPow(BigInteger.valueOf(d), BigInteger.valueOf(n)).longValue();
    }
}
