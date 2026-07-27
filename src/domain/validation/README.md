# `src/domain/validation`

Pure rules that consume geometry results and produce problems a person can act
on. `checkLayout` is the whole of it so far: it takes a room and what is placed
in it, and returns facts.

| Problem           | Carries                                                    |
| ----------------- | ---------------------------------------------------------- |
| `overlap`         | both instance ids, and the penetration depth               |
| `crosses-wall`    | the instance, the wall, and the overhang                   |
| `outside-room`    | the instance                                               |
| `walkway-blocked` | the route, the pieces in it, the width left, the shortfall |
| `walkway-tight`   | the same, against the width that was preferred             |

A problem is a fact, not a sentence. Wording it — in the reader's own unit, with
the name the piece goes by in the list beside the plan — belongs to the
interface, the same split the opening rules use.

Amounts matter more than the verdict. "It does not fit" cannot be acted on; "the
coffee table overlaps the sectional by four inches" can.

A route is measured against its preferred width, because that is the wider
corridor and so the one that sees everything narrowing the route. Falling under
the minimum is reported alone: a route you cannot walk down is not also worth
calling less comfortable than you hoped.

Still to come: blocked openings — a door's swing as a zone that has to stay
clear (roadmap step 11b).
