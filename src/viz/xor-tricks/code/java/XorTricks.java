public class XorTricks {
    /** The one value without a pair: pairs cancel, since x ^ x = 0. O(1) extra space. */
    static int single(int[] nums) {
        int acc = 0;
        for (int x : nums) acc ^= x;
        return acc;
    }

    /** The number missing from 0..n, given n different values from 0..n. */
    static int missing(int[] nums) {
        int acc = nums.length; // n is the one number that is not an index
        for (int i = 0; i < nums.length; i++) acc ^= i ^ nums[i];
        return acc;
    }

    /** The two values without a pair, smaller first. */
    static int[] twoSingles(int[] nums) {
        int x = 0;
        for (int v : nums) x ^= v; // ends as a ^ b, not 0 since a != b
        int low = x & -x; // the lowest bit where a and b differ
        int a = 0, b = 0;
        for (int v : nums) {
            if ((v & low) != 0) a ^= v;
            else b ^= v;
        }
        return new int[] {Math.min(a, b), Math.max(a, b)};
    }

    /** Swap values[i] and values[j] without a temporary. */
    static void swap(int[] values, int i, int j) {
        if (i == j) return; // values[i] ^= values[i] would make it 0
        values[i] ^= values[j];
        values[j] ^= values[i];
        values[i] ^= values[j];
    }
}
