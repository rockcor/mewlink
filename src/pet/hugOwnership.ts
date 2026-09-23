import type { PetSkin } from '../domain/types';

// Character ownership contours in the approved 384 × 256 Aseprite frames.
// A vertical half-image split would recolor the other dog's face and arms.
type Point = readonly [number, number];
type Contour = readonly Point[];
const work: readonly Contour[] = [
  [[217, 0], [217, 65], [244, 78], [279, 112], [277, 137], [253, 148], [304, 145], [240, 158], [229, 166], [230, 179], [245, 189], [256, 205], [272, 232], [304, 256]],
  [[216, 0], [216, 64], [240, 75], [263, 108], [262, 131], [253, 145], [308, 141], [251, 158], [240, 165], [241, 179], [249, 189], [256, 205], [272, 232], [304, 256]],
  [[218, 0], [218, 63], [246, 76], [270, 106], [269, 133], [255, 148], [302, 144], [225, 158], [215, 165], [216, 180], [239, 189], [250, 206], [271, 234], [304, 256]],
  [[228, 0], [228, 67], [253, 80], [280, 113], [279, 140], [256, 153], [299, 145], [221, 160], [212, 170], [216, 183], [239, 194], [250, 208], [272, 234], [304, 256]],
];
const idle: readonly Contour[] = [
  [[192, 0], [192, 60], [192, 100], [192, 140], [192, 153], [192, 166], [192, 182], [192, 256]],
  [[195, 0], [204, 61], [200, 105], [190, 141], [198, 153], [198, 168], [175, 184], [186, 256]],
  [[189, 0], [198, 81], [204, 115], [196, 146], [171, 151], [160, 170], [218, 178], [193, 256]],
  [[195, 0], [205, 62], [200, 108], [185, 145], [210, 163], [179, 178], [187, 190], [185, 256]],
];
const leisure: readonly Contour[] = [
  [[384, 0], [384, 60], [384, 110], [384, 157], [384, 170], [384, 185], [384, 215], [384, 256]],
  [[218, 0], [221, 65], [211, 113], [201, 153], [220, 170], [218, 188], [211, 216], [242, 256]],
  [[203, 0], [207, 64], [201, 113], [200, 156], [253, 165], [250, 188], [245, 215], [268, 256]],
  [[186, 0], [196, 63], [200, 108], [190, 156], [251, 165], [249, 185], [243, 213], [269, 256]],
];
const rest: readonly Contour[] = [
  [[384, 0], [384, 110], [384, 144], [384, 158], [384, 177], [384, 199], [384, 221], [384, 256]],
  [[200, 0], [199, 110], [208, 144], [265, 153], [261, 176], [294, 182], [276, 218], [298, 256]],
  [[180, 0], [183, 110], [208, 144], [205, 155], [200, 174], [247, 181], [311, 219], [330, 256]],
  [[186, 0], [192, 110], [208, 144], [239, 175], [230, 184], [235, 203], [281, 211], [311, 256]],
];

export function hugSenderContour(asset: string, frame: number): Point[] {
  const contours = asset.startsWith('hug-rest') ? rest : asset === 'hug-idle' ? idle : asset === 'hug-leisure' ? leisure : work;
  const progress = Math.max(0, Math.min(3, frame / 2));
  const from = Math.floor(progress), to = Math.min(3, from + 1), amount = progress - from;
  return contours[from].map(([x, y], index) => [
    x + (contours[to][index][0] - x) * amount,
    y + (contours[to][index][1] - y) * amount,
  ]);
}

export function hugSkins(target: 'self' | 'partner', self: PetSkin, partner: PetSkin) {
  return target === 'self' ? { receiver: self, sender: partner } : { receiver: partner, sender: self };
}

// Color each key pose before blending. A moving contour over a pre-blended
// frame would briefly paint the arriving dog's face in the receiver's color.
export function hugFrameSamples(frame: number): Array<{ frame: number; weight: number }> {
  const bounded = Math.max(0, Math.min(6, Math.floor(frame)));
  return bounded % 2 === 0 ? [{ frame: bounded, weight: 1 }]
    : [{ frame: bounded - 1, weight: .5 }, { frame: bounded + 1, weight: .5 }];
}
