# Next release

Include both changes below in the release notes and the new version's localized entry in `src/whatsNew.ts`. Keep the existing 0.3.43 entry unchanged; these changes have not been released yet.

- TA's replay notice appears only with the hover menu.
- The speaker on the pup's monitor bounces while browser or media-player audio plays, including on TA's pup through the activity heartbeat. The pup stays at its desk while audio plays; after two minutes without input, that time counts as leisure. Detection uses per-process output state on macOS 14.2+ and WASAPI session peak meters on Windows. Only a playing/not-playing bit is shared.

Suggested compact What's New text (both changes, within the existing notice limits):

- zh: 回放提示随悬停菜单出现；播放影音时，双方小狗桌前的音箱会跳动
- zh-Hant: 回放提示隨懸停選單出現；播放影音時，雙方小狗桌前的音箱會跳動
- en: Replay notices follow the hover menu; both pups' speakers bounce with music or video.
