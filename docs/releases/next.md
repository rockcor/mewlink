# Next release

- Moving the pet window clears click-to-pin and releases DOM/native pointer holds. A native drop click remains suppressed until the next genuine pointer press, so a delayed click cannot pin the hover menu and leave the pets opaque. Hover resumes at the new position; leaving the visible artwork/menu closes it after 180 ms and restores the saved transparency.
- Cursor-probe failures also clear hover, allowing an unpinned menu to close.
- Add a localized What's New entry when preparing the next version.

## Away and meals

- Away now has its own desk scene: the pup ducks behind its desk and leaves a localized “back soon” sticky note. Water lands on the empty desk; a hug becomes a visit that leaves a paw print until the pup returns.
- A resting pup eats rice at a low table during its owner's local mealtimes (07:00–09:00, 11:30–13:30, 17:30–19:30), provided it has been away at most two hours. Each owner computes and shares `ActivitySegment.meal` in the heartbeat. Water lands beside the table; a hug becomes a hopping visit.
- Artwork comes from `art/aseprite/rig/away.py` and `meal.py`. The main pet master was preserved during strip re-export.

Suggested compact What's New text for these two features:

- zh: 暂时离开会留下“马上回来”便签；饭点休息时，小狗会坐下吃饭
- zh-Hant: 暫時離開會留下「馬上回來」便條；飯點休息時，小狗會坐下吃飯
- en: Away leaves a back-soon note; at your local mealtimes, resting pups eat rice.

Include the drag-menu fix above in the full release notes too. Keep existing published What's New entries unchanged until the next version is prepared.
