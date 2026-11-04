# Next release

- Moving the pet window clears click-to-pin and releases DOM/native pointer holds. A native drop click remains suppressed until the next genuine pointer press, so a delayed click cannot pin the hover menu and leave the pets opaque. Hover resumes at the new position; leaving the visible artwork/menu closes it after 180 ms and restores the saved transparency.
- Cursor-probe failures also clear hover, allowing an unpinned menu to close.
- Add a localized What's New entry when preparing the next version.
