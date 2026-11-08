import java.util.function.IntUnaryOperator;

/** Two structures that count their own work, and a bank for the accounting method. */
public class Amortized {
    public static int doubling(int capacity) {
        return Math.max(1, 2 * capacity);
    }

    /**
     * An array that grows when it is full. append returns its actual cost: 1 for the write,
     * plus 1 for every item a grow copies into the new array.
     */
    public static class DynamicArray {
        private final IntUnaryOperator grow; // the new capacity for a full array
        private int[] data = new int[0];
        private int size = 0;

        public DynamicArray(IntUnaryOperator grow) {
            this.grow = grow;
        }

        public int size() {
            return size;
        }

        public int append(int x) {
            int cost = 0;
            if (size == data.length) {
                int[] bigger = new int[grow.applyAsInt(data.length)];
                for (int i = 0; i < size; i++) {
                    bigger[i] = data[i];
                    cost++;
                }
                data = bigger;
            }
            data[size] = x;
            size++;
            return cost + 1;
        }
    }

    /** A k-bit counter. increment returns how many bits it flipped. */
    public static class BinaryCounter {
        private final int[] bits; // bits[0] is the lowest bit

        public BinaryCounter(int k) {
            bits = new int[k];
        }

        public int increment() {
            int cost = 0;
            int i = 0;
            while (i < bits.length && bits[i] == 1) {
                bits[i] = 0;
                cost++;
                i++;
            }
            if (i < bits.length) {
                bits[i] = 1;
                cost++;
            }
            return cost;
        }
    }

    /**
     * The accounting method: every operation pays `charge` coins in, and its actual cost comes
     * out. The charge is big enough only if the balance never goes below zero.
     */
    public static class Bank {
        private final int charge;
        private int balance = 0;

        public Bank(int charge) {
            this.charge = charge;
        }

        public int pay(int cost) {
            balance += charge - cost;
            return balance;
        }
    }
}
