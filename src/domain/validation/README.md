# `src/domain/validation`

Pure rules that consume geometry results and produce problems a person can act
on. `checkLayout` is the whole of it so far: it takes a room and what is placed
in it, and returns facts.

| Problem         | Carries                                      |
| --------------- | -------------------------------------------- |
| `overlap`       | both instance ids, and the penetration depth |
| `crosses-wall`  | the instance, the wall, and the overhang     |
| `outside-room`  | the instance                                 |
| `rooms-overlap` | both room ids, and the penetration depth     |

A problem is a fact, not a sentence. Wording it — in the reader's own unit, with
the name the piece goes by in the list beside the plan — belongs to the
interface, the same split the opening rules use.

Amounts matter more than the verdict. "It does not fit" cannot be acted on; "the
coffee table overlaps the sectional by four inches" can.

Still to come: detecting furniture that blocks a door or its swing.
