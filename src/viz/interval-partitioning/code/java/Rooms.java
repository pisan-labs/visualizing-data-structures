import java.util.Arrays;
import java.util.Comparator;
import java.util.PriorityQueue;
import java.util.stream.IntStream;

public class Rooms {
    /**
     * Gives each lecture a room, using as few rooms as possible. Lecture k runs over
     * [start[k], finish[k]). Returns the room (from 1) of each lecture; the most is the count.
     */
    public static int[] assign(int[] start, int[] finish) {
        Integer[] order = IntStream.range(0, start.length).boxed().toArray(Integer[]::new);
        Arrays.sort(order, Comparator.comparingInt(k -> start[k])); // stable
        // Rooms in use as {time free, room}, the one free soonest first.
        PriorityQueue<int[]> freeAt = new PriorityQueue<>(
                Comparator.<int[]>comparingInt(e -> e[0]).thenComparingInt(e -> e[1]));
        int[] room = new int[start.length];
        int rooms = 0;
        for (int k : order) {
            int r;
            if (!freeAt.isEmpty() && freeAt.peek()[0] <= start[k]) {
                r = freeAt.poll()[1]; // reuse the room free soonest
            } else {
                r = ++rooms; // open a new room
            }
            room[k] = r;
            freeAt.add(new int[] {finish[k], r});
        }
        return room;
    }
}
