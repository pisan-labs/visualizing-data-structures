import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.function.IntUnaryOperator;

/**
 * Test driver: reads one operation per line, prints one result per line. "array 2" (or "array
 * 1.5", "array 4") starts an empty dynamic array with that growth rule, "counter" an 8-bit
 * counter, and "charge 3" opens a bank. "append" and "increment" print the actual cost and the
 * bank after it.
 */
public class Main {
    static IntUnaryOperator growth(String rule) {
        return switch (rule) {
            case "1.5" -> c -> Math.max(1, (3 * c + 1) / 2); // the ceiling of 1.5 * c
            case "4" -> c -> c + 4;
            default -> Amortized::doubling;
        };
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        Amortized.DynamicArray array = null;
        Amortized.BinaryCounter counter = null;
        Amortized.Bank bank = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int cost;
            switch (parts[0]) {
                case "array" -> array = new Amortized.DynamicArray(growth(parts[1]));
                case "counter" -> counter = new Amortized.BinaryCounter(8);
                case "charge" -> bank = new Amortized.Bank(Integer.parseInt(parts[1]));
                default -> {
                    if (parts[0].equals("append")) cost = array.append(array.size() + 1);
                    else cost = counter.increment();
                    out.append(cost).append(' ').append(bank.pay(cost)).append('\n');
                }
            }
        }
        System.out.print(out);
    }
}
