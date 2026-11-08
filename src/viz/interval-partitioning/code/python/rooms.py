import heapq


def assign_rooms(lectures):
    """Give each lecture a room, using as few rooms as possible.

    lectures is a list of (start, finish) pairs, half-open: one lecture may start when another
    finishes. Returns the number of rooms and the room (from 1) of each lecture.
    """
    order = sorted(range(len(lectures)), key=lambda k: lectures[k][0])
    free_at = []  # min-heap of (time the room is free, room)
    room = [0] * len(lectures)
    rooms = 0
    for k in order:
        start, finish = lectures[k]
        if free_at and free_at[0][0] <= start:
            _, r = heapq.heappop(free_at)  # reuse the room free soonest
        else:
            rooms += 1
            r = rooms  # open a new room
        room[k] = r
        heapq.heappush(free_at, (finish, r))
    return rooms, room
