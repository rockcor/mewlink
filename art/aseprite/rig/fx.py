"""Effect stamps for the MewLink pet animations: dust puffs, sparkles, hearts, z's."""

from __future__ import annotations

from pixel import ellipse, ramp, rgba

PUFF = ramp("#b7a0c4", "#e6d9ef", "#efe6f5", "#fffaff", "#ffffff")

C = {k: rgba(v) for k, v in {
    "w": "#ffffff", "y": "#ffd76a", "zz": "#a393e6", "note": "#d46a8f", "heart": "#ff7fa0",
    "heartd": "#e2587e", "sweat": "#8fd3ff", "tick": "#c9a3bb",
}.items()}


STAMPS = {
    "heart": ([".KK.KK.", "KhwKhhK", "KhhhhhK", ".KhhhK.", "..KhK..", "...K..."], {"K": "heartd", "h": "heart", "w": "w"}),
    "heart_s": ([".h.h.", "hhhhh", ".hhh.", "..h.."], {"h": "heart"}),
    "sparkle": (["..Y..", "..Y..", "YYwYY", "..Y..", "..Y.."], {"Y": "y", "w": "w"}),
    "sparkle_s": ([".Y.", "YwY", ".Y."], {"Y": "y", "w": "w"}),
    "Z": (["ZZZZ", "..Z.", ".Z..", "ZZZZ"], {"Z": "zz"}),
    "z": (["zzz", ".z.", "zzz"], {"z": "zz"}),
    "sweat": ([".S.", "SSS", "SSw", ".S."], {"S": "sweat", "w": "w"}),
    "note": (["..NNN", "..N.N", "..N..", "NNN..", "NNN.."], {"N": "note"}),
    "bang": (["N", "N", "N", ".", "N"], {"N": "note"}),
    "tick_l": (["t.", ".t", ".."], {"t": "tick"}),
    "tick_r": ([".t", "t.", ".."], {"t": "tick"}),
    "tick_u": (["t.t", "..."], {"t": "tick"}),
    "wave": (["t.", ".t", ".t", "t."], {"t": "tick"}),
    "star": (["..y..", ".yyy.", "yyyyy", ".y.y."], {"y": "y"}),
}


def draw_fx(cv, items, layer="fx"):
    # Overlapping puffs merge into one cloud with a single outer outline;
    # sparkles and hearts sit on top of it.
    cloud = None
    for item in items:
        if item["k"] == "puff" and item.get("r", 3) > 0.4:
            r = item.get("r", 3)
            mask = ellipse(item["x"], item["y"], r, r * 0.85)
            cloud = mask if cloud is None else cloud | mask
    if cloud is not None:
        cv.part(layer, cloud, PUFF, shade=(1, 1), line=False)
    for item in items:
        if item["k"] == "puff":
            continue
        rows, colors = STAMPS[item["k"]]
        cv.stamp(layer, rows, item["x"] - len(rows[0]) // 2, item["y"] - len(rows) // 2,
                 {key: C[value] for key, value in colors.items()})
