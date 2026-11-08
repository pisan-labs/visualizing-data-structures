import java.util.ArrayList;
import java.util.List;

public class Sieve {
    /** The primes up to n (n >= 2) by the sieve of Eratosthenes. */
    public static List<Integer> sieve(int n) {
        boolean[] crossed = new boolean[n + 1];
        for (int p = 2; p * p <= n; p++) {
            if (crossed[p]) continue;
            for (int j = p * p; j <= n; j += p) crossed[j] = true;
        }
        List<Integer> primes = new ArrayList<>();
        for (int k = 2; k <= n; k++) {
            if (!crossed[k]) primes.add(k);
        }
        return primes;
    }
}
