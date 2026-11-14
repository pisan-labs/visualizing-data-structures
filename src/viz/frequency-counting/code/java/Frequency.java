import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Frequency {
    private Frequency() {}

    /** The 26 letter counts of a lowercase word. */
    static int[] counts(String word) {
        int[] count = new int[26];
        for (char ch : word.toCharArray()) count[ch - 'a']++;
        return count;
    }

    /** Lists of the words that are anagrams of each other, in the order each group starts. */
    public static List<List<String>> groupAnagrams(List<String> words) {
        // Key: all 26 counts as text; a LinkedHashMap keeps insertion order.
        Map<String, List<String>> groups = new LinkedHashMap<>();
        for (String w : words) {
            groups.computeIfAbsent(Arrays.toString(counts(w)), k -> new ArrayList<>()).add(w);
        }
        return new ArrayList<>(groups.values());
    }

    /** The index of the first letter of s that appears only once, or -1. Two passes, O(n). */
    public static int firstUnique(String s) {
        int[] count = counts(s);
        for (int i = 0; i < s.length(); i++) {
            if (count[s.charAt(i) - 'a'] == 1) return i;
        }
        return -1;
    }
}
