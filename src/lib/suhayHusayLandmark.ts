/**
 * Static, renderer-only pose data for the Student Map's Suhay Husay landmark.
 * Coordinates describe one small carved composition in local model space;
 * x is the side-to-side silhouette, y is height, and z is front/back depth.
 * Keep this separate from authored campus data and navigation topology.
 */
export type SuhayPoint3 = readonly [number, number, number];

export const SUHAY_HUSAY_V3_POINTS = {
  upperFootLeft: [-0.43, 0.13, -0.12],
  upperKneeLeft: [-0.31, 0.43, -0.12],
  upperHipLeft: [-0.13, 0.78, -0.12],
  upperPelvis: [-0.01, 0.82, -0.12],
  upperHipRight: [0.13, 0.78, -0.12],
  upperKneeRight: [0.31, 0.43, -0.12],
  upperFootRight: [0.43, 0.13, -0.12],
  upperChest: [-0.11, 1.13, -0.15],
  upperShoulderLeft: [-0.24, 1.13, -0.12],
  upperShoulderRight: [0.04, 1.16, -0.12],
  upperElbowLeft: [-0.29, 1.01, 0.02],
  upperElbowRight: [0.22, 1.02, 0.02],
  upperNeck: [-0.16, 1.34, -0.16],
  upperHead: [-0.25, 1.47, -0.19],

  lowerFootLeft: [-0.27, 0.13, 0.38],
  lowerKneeLeft: [-0.23, 0.28, 0.37],
  lowerHipLeft: [-0.10, 0.36, 0.36],
  lowerPelvis: [0.01, 0.38, 0.36],
  lowerHipRight: [0.13, 0.36, 0.36],
  lowerKneeRight: [0.24, 0.25, 0.38],
  lowerFootRight: [0.34, 0.14, 0.39],
  lowerChest: [-0.015, 0.66, 0.36],
  lowerShoulderLeft: [-0.12, 0.68, 0.36],
  lowerShoulderRight: [0.095, 0.68, 0.36],
  lowerElbowLeft: [-0.22, 0.83, 0.32],
  lowerElbowRight: [0.21, 0.82, 0.32],
  lowerNeck: [-0.015, 0.79, 0.37],
  lowerHead: [-0.04, 0.88, 0.39],

  claspLeft: [-0.14, 0.96, 0.24],
  claspRight: [0.15, 0.96, 0.24],
} as const satisfies Record<string, SuhayPoint3>;

export type SuhayPointName = keyof typeof SUHAY_HUSAY_V3_POINTS;

/** Thick, faceted limb masses are built between these shared joint anchors. */
export const SUHAY_HUSAY_V3_LIMBS = [
  { id: "upper-left-shin", from: "upperFootLeft", to: "upperKneeLeft", radius: 0.067, tone: "shadow" },
  { id: "upper-left-thigh", from: "upperKneeLeft", to: "upperHipLeft", radius: 0.082, tone: "main" },
  { id: "upper-right-shin", from: "upperFootRight", to: "upperKneeRight", radius: 0.067, tone: "shadow" },
  { id: "upper-right-thigh", from: "upperKneeRight", to: "upperHipRight", radius: 0.082, tone: "main" },
  { id: "upper-left-arm", from: "upperShoulderLeft", to: "upperElbowLeft", radius: 0.055, tone: "highlight" },
  { id: "upper-left-forearm", from: "upperElbowLeft", to: "claspLeft", radius: 0.047, tone: "main" },
  { id: "upper-right-arm", from: "upperShoulderRight", to: "upperElbowRight", radius: 0.055, tone: "highlight" },
  { id: "upper-right-forearm", from: "upperElbowRight", to: "claspRight", radius: 0.047, tone: "main" },
  { id: "upper-neck", from: "upperChest", to: "upperNeck", radius: 0.058, tone: "highlight" },

  { id: "lower-left-shin", from: "lowerKneeLeft", to: "lowerFootLeft", radius: 0.058, tone: "shadow" },
  { id: "lower-left-thigh", from: "lowerHipLeft", to: "lowerKneeLeft", radius: 0.075, tone: "main" },
  { id: "lower-right-shin", from: "lowerKneeRight", to: "lowerFootRight", radius: 0.058, tone: "shadow" },
  { id: "lower-right-thigh", from: "lowerHipRight", to: "lowerKneeRight", radius: 0.075, tone: "main" },
  { id: "lower-left-arm", from: "lowerShoulderLeft", to: "lowerElbowLeft", radius: 0.049, tone: "highlight" },
  { id: "lower-left-forearm", from: "lowerElbowLeft", to: "claspLeft", radius: 0.043, tone: "main" },
  { id: "lower-right-arm", from: "lowerShoulderRight", to: "lowerElbowRight", radius: 0.049, tone: "highlight" },
  { id: "lower-right-forearm", from: "lowerElbowRight", to: "claspRight", radius: 0.043, tone: "main" },
  { id: "lower-neck", from: "lowerChest", to: "lowerNeck", radius: 0.043, tone: "highlight" },
] as const;

/** Deterministic dodecahedral masses form a rising rock outcrop, not a box. */
export const SUHAY_HUSAY_V3_ROCKS = [
  { id: "left-foot", position: [-0.48, 0.19, -0.08], scale: [0.25, 0.24, 0.32], rotation: [0.12, 0.28, -0.12], tone: "dark" },
  { id: "left-ridge", position: [-0.43, 0.48, -0.17], scale: [0.19, 0.38, 0.25], rotation: [0.08, -0.38, 0.12], tone: "mid" },
  { id: "left-front", position: [-0.34, 0.24, 0.05], scale: [0.25, 0.2, 0.16], rotation: [-0.1, 0.5, 0.06], tone: "light" },
  { id: "rear-peak", position: [0, 0.41, -0.29], scale: [0.34, 0.43, 0.24], rotation: [0.12, 0.12, -0.08], tone: "mid" },
  { id: "right-ridge", position: [0.43, 0.46, -0.16], scale: [0.2, 0.39, 0.25], rotation: [-0.12, 0.35, -0.08], tone: "dark" },
  { id: "right-front", position: [0.38, 0.22, 0.05], scale: [0.27, 0.19, 0.16], rotation: [0.1, -0.25, 0.08], tone: "mid" },
  { id: "center-low", position: [0.04, 0.18, 0.06], scale: [0.34, 0.17, 0.12], rotation: [0.02, 0.18, -0.04], tone: "light" },
  { id: "right-base", position: [0.52, 0.16, -0.03], scale: [0.16, 0.19, 0.27], rotation: [-0.08, 0.45, 0.05], tone: "dark" },
] as const;

/** V4 is a deliberately compact side-profile composition: the wide stance
 * frames a seated figure in the center, while both figures reach to the same
 * pair of hand anchors. These anchors are shared by the 2D and 3D renderers. */
export const SUHAY_HUSAY_V4_POINTS = {
  upperFootLeft: [-0.42, 0.13, -0.12],
  upperKneeLeft: [-0.29, 0.43, -0.12],
  upperHipLeft: [-0.16, 0.75, -0.12],
  upperPelvis: [-0.01, 0.78, -0.12],
  upperHipRight: [0.16, 0.75, -0.12],
  upperKneeRight: [0.29, 0.43, -0.12],
  upperFootRight: [0.42, 0.13, -0.12],
  upperChest: [-0.14, 1.12, -0.12],
  upperShoulderLeft: [-0.25, 1.12, -0.12],
  upperShoulderRight: [0.01, 1.1, -0.12],
  upperElbowLeft: [-0.28, 0.97, 0.01],
  upperElbowRight: [0.21, 0.96, 0.01],
  upperNeck: [-0.23, 1.32, -0.12],
  upperHead: [-0.32, 1.48, -0.12],

  lowerFootLeft: [-0.34, 0.14, 0.34],
  lowerKneeLeft: [-0.24, 0.3, 0.33],
  lowerHipLeft: [-0.1, 0.42, 0.31],
  lowerPelvis: [0.02, 0.43, 0.31],
  lowerHipRight: [0.14, 0.42, 0.31],
  lowerKneeRight: [0.25, 0.3, 0.33],
  lowerFootRight: [0.34, 0.14, 0.34],
  lowerChest: [0.04, 0.56, 0.32],
  lowerShoulderLeft: [-0.08, 0.59, 0.32],
  lowerShoulderRight: [0.15, 0.58, 0.32],
  lowerElbowLeft: [-0.1, 0.81, 0.23],
  lowerElbowRight: [0.2, 0.8, 0.23],
  lowerNeck: [0.06, 0.65, 0.32],
  lowerHead: [0.08, 0.74, 0.32],

  claspLeft: [-0.06, 0.88, 0.15],
  claspRight: [0.15, 0.87, 0.15],
} as const satisfies Record<string, SuhayPoint3>;

export type SuhayV4PointName = keyof typeof SUHAY_HUSAY_V4_POINTS;

/** Broad, joined faceted forms for V4; the widths are intentionally larger
 * than the old exposed-rod treatment so the sculpture reads at map scale. */
export const SUHAY_HUSAY_V4_LIMBS = [
  { id: "upper-left-shin", from: "upperFootLeft", to: "upperKneeLeft", radius: 0.073, tone: "shadow" },
  { id: "upper-left-thigh", from: "upperKneeLeft", to: "upperHipLeft", radius: 0.088, tone: "main" },
  { id: "upper-right-shin", from: "upperFootRight", to: "upperKneeRight", radius: 0.073, tone: "shadow" },
  { id: "upper-right-thigh", from: "upperKneeRight", to: "upperHipRight", radius: 0.088, tone: "main" },
  { id: "upper-left-arm", from: "upperShoulderLeft", to: "upperElbowLeft", radius: 0.065, tone: "highlight" },
  { id: "upper-left-forearm", from: "upperElbowLeft", to: "claspLeft", radius: 0.057, tone: "main" },
  { id: "upper-right-arm", from: "upperShoulderRight", to: "upperElbowRight", radius: 0.065, tone: "main" },
  { id: "upper-right-forearm", from: "upperElbowRight", to: "claspRight", radius: 0.057, tone: "highlight" },
  { id: "upper-neck", from: "upperChest", to: "upperNeck", radius: 0.067, tone: "highlight" },
  { id: "lower-left-shin", from: "lowerKneeLeft", to: "lowerFootLeft", radius: 0.062, tone: "shadow" },
  { id: "lower-left-thigh", from: "lowerHipLeft", to: "lowerKneeLeft", radius: 0.082, tone: "main" },
  { id: "lower-right-shin", from: "lowerKneeRight", to: "lowerFootRight", radius: 0.062, tone: "shadow" },
  { id: "lower-right-thigh", from: "lowerHipRight", to: "lowerKneeRight", radius: 0.082, tone: "highlight" },
  { id: "lower-left-arm", from: "lowerShoulderLeft", to: "lowerElbowLeft", radius: 0.054, tone: "highlight" },
  { id: "lower-left-forearm", from: "lowerElbowLeft", to: "claspLeft", radius: 0.05, tone: "main" },
  { id: "lower-right-arm", from: "lowerShoulderRight", to: "lowerElbowRight", radius: 0.054, tone: "main" },
  { id: "lower-right-forearm", from: "lowerElbowRight", to: "claspRight", radius: 0.05, tone: "highlight" },
  { id: "lower-neck", from: "lowerChest", to: "lowerNeck", radius: 0.052, tone: "highlight" },
] as const;

/** Three fixed support facets make one integrated outcrop around the seat;
 * unlike V3's scattered boulders, this is a defined pedestal composition. */
export const SUHAY_HUSAY_V4_SUPPORTS = [
  { id: "left-rising-support", position: [-0.4, 0.27, -0.22], scale: [0.15, 0.23, 0.16], rotation: [0.02, 0.12, -0.16], tone: "dark" },
  { id: "center-seat-support", position: [0.02, 0.27, 0.02], scale: [0.23, 0.15, 0.18], rotation: [0.04, -0.08, 0.02], tone: "mid" },
  { id: "right-rising-support", position: [0.4, 0.27, -0.22], scale: [0.15, 0.23, 0.16], rotation: [-0.02, -0.12, 0.16], tone: "light" },
] as const;

/** V5 is a side-oriented, two-person composition. The upper figure stands on
 * the left, leans and looks skyward; the lower figure reclines on the right,
 * inside the standing figure's broad stance. Shared clasp anchors keep the
 * joined-hand gesture consistent in the 2D and 3D student renderers. */
export const SUHAY_HUSAY_V5_POINTS = {
  upperFootLeft: [-0.7, 0.4, -0.1],
  upperKneeLeft: [-0.57, 0.65, -0.1],
  upperHipLeft: [-0.44, 0.97, -0.1],
  upperPelvis: [-0.19, 0.99, -0.1],
  upperHipRight: [0.13, 0.95, -0.1],
  upperKneeRight: [0.28, 0.63, 0.02],
  upperFootRight: [0.43, 0.4, 0.06],
  upperChest: [-0.4, 1.32, -0.12],
  upperShoulderLeft: [-0.54, 1.31, -0.1],
  upperShoulderRight: [-0.28, 1.34, -0.1],
  upperElbowLeft: [-0.13, 1.46, 0.03],
  upperElbowRight: [0.16, 1.32, 0.04],
  upperNeck: [-0.48, 1.58, -0.14],
  upperHead: [-0.56, 1.76, -0.16],

  lowerFootLeft: [0.2, 0.16, 0.68],
  lowerKneeLeft: [0.4, 0.26, 0.66],
  lowerHipLeft: [0.16, 0.39, 0.64],
  lowerPelvis: [0.24, 0.4, 0.64],
  lowerHipRight: [0.34, 0.38, 0.66],
  lowerKneeRight: [0.56, 0.29, 0.68],
  lowerFootRight: [0.48, 0.16, 0.7],
  lowerChest: [0.17, 0.69, 0.65],
  lowerShoulderLeft: [0.06, 0.7, 0.65],
  lowerShoulderRight: [0.29, 0.68, 0.67],
  lowerElbowLeft: [-0.01, 0.98, 0.48],
  lowerElbowRight: [0.4, 0.94, 0.52],
  lowerNeck: [0.16, 0.77, 0.66],
  lowerHead: [0.19, 0.84, 0.68],

  claspLeft: [0.03, 1.16, 0.38],
  claspRight: [0.28, 1.14, 0.4],
} as const satisfies Record<string, SuhayPoint3>;

export type SuhayV5PointName = keyof typeof SUHAY_HUSAY_V5_POINTS;

/** Broad faceted limbs are deliberately tapered and substantial at map scale. */
export const SUHAY_HUSAY_V5_LIMBS = [
  { id: "upper-left-shin", from: "upperFootLeft", to: "upperKneeLeft", radius: 0.082, tone: "shadow" },
  { id: "upper-left-thigh", from: "upperKneeLeft", to: "upperHipLeft", radius: 0.105, tone: "main" },
  { id: "upper-right-shin", from: "upperFootRight", to: "upperKneeRight", radius: 0.082, tone: "shadow" },
  { id: "upper-right-thigh", from: "upperKneeRight", to: "upperHipRight", radius: 0.105, tone: "main" },
  { id: "upper-left-arm", from: "upperShoulderLeft", to: "upperElbowLeft", radius: 0.072, tone: "highlight" },
  { id: "upper-left-forearm", from: "upperElbowLeft", to: "claspLeft", radius: 0.067, tone: "main" },
  { id: "upper-right-arm", from: "upperShoulderRight", to: "upperElbowRight", radius: 0.075, tone: "main" },
  { id: "upper-right-forearm", from: "upperElbowRight", to: "claspRight", radius: 0.067, tone: "highlight" },
  { id: "upper-neck", from: "upperChest", to: "upperNeck", radius: 0.072, tone: "highlight" },
  { id: "lower-left-shin", from: "lowerKneeLeft", to: "lowerFootLeft", radius: 0.07, tone: "shadow" },
  { id: "lower-left-thigh", from: "lowerHipLeft", to: "lowerKneeLeft", radius: 0.09, tone: "main" },
  { id: "lower-right-shin", from: "lowerKneeRight", to: "lowerFootRight", radius: 0.07, tone: "shadow" },
  { id: "lower-right-thigh", from: "lowerHipRight", to: "lowerKneeRight", radius: 0.09, tone: "highlight" },
  { id: "lower-left-arm", from: "lowerShoulderLeft", to: "lowerElbowLeft", radius: 0.062, tone: "highlight" },
  { id: "lower-left-forearm", from: "lowerElbowLeft", to: "claspLeft", radius: 0.06, tone: "main" },
  { id: "lower-right-arm", from: "lowerShoulderRight", to: "lowerElbowRight", radius: 0.062, tone: "main" },
  { id: "lower-right-forearm", from: "lowerElbowRight", to: "claspRight", radius: 0.06, tone: "highlight" },
  { id: "lower-neck", from: "lowerChest", to: "lowerNeck", radius: 0.057, tone: "highlight" },
] as const;

/** A single organized rocky shoulder rises from the plinth and supports the
 * seated figure; the facets are fixed rather than randomized. */
export const SUHAY_HUSAY_V5_ROCKS = [
  { id: "rear-rise", position: [-0.13, 0.37, -0.27], scale: [0.28, 0.28, 0.17], rotation: [0.05, 0.18, -0.08], tone: "mid" },
  { id: "left-rock-shoulder", position: [-0.46, 0.28, -0.18], scale: [0.2, 0.22, 0.18], rotation: [0.06, -0.22, -0.12], tone: "dark" },
  { id: "center-ridge", position: [0.02, 0.36, -0.2], scale: [0.25, 0.24, 0.17], rotation: [-0.04, 0.12, 0.06], tone: "light" },
  { id: "seated-figure-seat", position: [0.33, 0.27, -0.12], scale: [0.26, 0.15, 0.18], rotation: [0.03, -0.1, 0.08], tone: "mid" },
  { id: "right-rock-shoulder", position: [0.56, 0.24, -0.1], scale: [0.18, 0.17, 0.16], rotation: [-0.08, 0.24, 0.06], tone: "dark" },
] as const;

/** Projection used only by the compact Student 2D landmark symbol. */
export function suhayHusaySymbolPoint(point: readonly number[]): [number, number] {
  return [16 + point[0] * 20, 28 - point[1] * 15];
}

export function suhayHusaySymbolPath(points: readonly (readonly number[])[]): string {
  return points.map((point, index) => {
    const [x, y] = suhayHusaySymbolPoint(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
}

/** V6 uses a deliberately simple side-profile silhouette: one broad standing
 * figure with an upward reach, and a folded figure low on the right. These
 * polygons are shared by the Student 2D icon and the 3D extruded sculpture. */
export const SUHAY_HUSAY_V6_SHAPES = {
  pedestal: [[-0.72, 0.15], [0.72, 0.15], [0.56, -0.15], [-0.56, -0.15]],
  outcrop: [[-0.67, 0.23], [-0.5, 0.46], [-0.33, 0.38], [-0.11, 0.62], [0.06, 0.46], [0.28, 0.62], [0.56, 0.46], [0.67, 0.23], [0.56, 0.15], [-0.56, 0.15]],
  standingLeftLeg: [[-0.31, 0.92], [-0.2, 0.92], [-0.34, 0.54], [-0.54, 0.38], [-0.62, 0.46], [-0.43, 0.69]],
  standingRightLeg: [[-0.03, 0.92], [0.08, 0.92], [0.42, 0.62], [0.74, 0.38], [0.63, 0.34], [0.34, 0.52], [0.05, 0.76]],
  standingTorso: [[-0.4, 1.38], [-0.36, 1.46], [-0.11, 1.46], [-0.06, 1.31], [-0.06, 0.92], [-0.16, 0.85], [-0.31, 1]],
  standingNeck: [[-0.31, 1.42], [-0.2, 1.44], [-0.17, 1.67], [-0.27, 1.67]],
  standingHead: [[-0.32, 1.65], [-0.2, 1.62], [-0.11, 1.72], [-0.15, 1.9], [-0.29, 1.98], [-0.38, 1.86]],
  standingRaisedArm: [[-0.29, 1.35], [-0.24, 1.39], [-0.38, 1.56], [-0.62, 1.83], [-0.67, 1.88], [-0.72, 1.83], [-0.49, 1.53], [-0.38, 1.43]],
  standingLinkedArm: [[-0.06, 1.38], [0.02, 1.42], [0.11, 1.31], [0.14, 1.18], [0.1, 1.11], [0.02, 1.12], [-0.09, 1.25]],
  lowerRaisedThigh: [[0.2, 0.69], [0.32, 0.76], [0.48, 0.69], [0.68, 0.59], [0.71, 0.53], [0.64, 0.49], [0.43, 0.58], [0.31, 0.55]],
  lowerBentShin: [[0.62, 0.58], [0.71, 0.55], [0.68, 0.4], [0.62, 0.36], [0.55, 0.4], [0.56, 0.46]],
  lowerTuckedLeg: [[0.2, 0.63], [0.31, 0.58], [0.43, 0.52], [0.38, 0.42], [0.27, 0.4], [0.18, 0.46], [0.12, 0.55]],
  lowerTorso: [[0.35, 0.62], [0.37, 0.79], [0.47, 0.93], [0.58, 0.9], [0.59, 0.76], [0.53, 0.65], [0.44, 0.6]],
  lowerHead: [[0.41, 0.91], [0.43, 1.04], [0.55, 1.11], [0.63, 1.03], [0.61, 0.91], [0.49, 0.87]],
  lowerLinkedArm: [[0.36, 0.81], [0.25, 0.92], [0.12, 1.07], [0.16, 1.13], [0.27, 1.08], [0.36, 1.01], [0.45, 0.89]],
  lowerRestingArm: [[0.49, 0.78], [0.59, 0.75], [0.68, 0.63], [0.62, 0.58], [0.52, 0.7], [0.44, 0.7]],
  clasp: [[0.11, 1.07], [0.16, 1.1], [0.19, 1.14], [0.14, 1.18], [0.09, 1.14]],
  pedestalFacet: [[-0.58, 0.42], [-0.2, 0.55], [-0.22, -0.15], [-0.58, -0.15]],
  outcropFacet: [[-0.5, 0.46], [-0.11, 0.62], [0.06, 0.46], [-0.22, 0.15], [-0.56, 0.15]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

export type SuhayV6ShapeName = keyof typeof SUHAY_HUSAY_V6_SHAPES;

/** Fits the V6 shared side-profile silhouette within the compact 32×32 map
 * icon without changing the projection used by preserved legacy versions. */
export function suhayHusayV6SymbolPoint(point: readonly number[]): [number, number] {
  return [16 + point[0] * 18, 28 - point[1] * 13];
}

/** V7 keeps the authored left/right reading but gives the lower figure a
 * compact seated pose inside the upper figure's wide stance. The plinth is a
 * formal tapered mass with one rising stone shoulder rather than loose rocks. */
export const SUHAY_HUSAY_V7_SHAPES = {
  pedestal: [[-0.78, 0.2], [0.78, 0.2], [0.58, -0.18], [-0.58, -0.18]],
  pedestalTop: [[-0.63, 0.28], [0.63, 0.28], [0.78, 0.2], [-0.78, 0.2]],
  pedestalFacet: [[-0.59, 0.18], [-0.2, 0.27], [-0.27, -0.15], [-0.58, -0.18]],
  outcrop: [[-0.64, 0.24], [-0.48, 0.42], [-0.32, 0.37], [-0.08, 0.61], [0.18, 0.46], [0.4, 0.37], [0.62, 0.24], [0.4, 0.2], [-0.43, 0.2]],
  outcropFacet: [[-0.48, 0.42], [-0.32, 0.37], [-0.08, 0.61], [0.11, 0.46], [-0.12, 0.24], [-0.43, 0.2]],

  standingLeftLeg: [[-0.31, 0.98], [-0.18, 0.98], [-0.3, 0.61], [-0.53, 0.38], [-0.68, 0.34], [-0.63, 0.46], [-0.41, 0.72]],
  standingRightLeg: [[0.01, 0.97], [0.16, 0.96], [0.34, 0.67], [0.62, 0.39], [0.52, 0.34], [0.31, 0.48], [0.08, 0.73]],
  standingTorso: [[-0.4, 1.36], [-0.35, 1.45], [-0.12, 1.43], [-0.04, 1.29], [0.01, 0.96], [-0.15, 0.89], [-0.32, 1.01]],
  standingNeck: [[-0.34, 1.4], [-0.22, 1.43], [-0.25, 1.66], [-0.36, 1.7]],
  standingHead: [[-0.43, 1.69], [-0.31, 1.66], [-0.2, 1.75], [-0.19, 1.9], [-0.31, 1.98], [-0.42, 1.9]],
  standingRaisedArm: [[-0.37, 1.36], [-0.27, 1.4], [-0.35, 1.58], [-0.48, 1.77], [-0.42, 1.89], [-0.52, 1.94], [-0.64, 1.78], [-0.5, 1.55]],
  standingLinkedArm: [[-0.04, 1.35], [0.08, 1.39], [0.2, 1.26], [0.31, 1.12], [0.29, 1.03], [0.19, 1.02], [0.1, 1.17]],

  lowerBackThigh: [[0.04, 0.58], [0.2, 0.71], [0.39, 0.66], [0.57, 0.53], [0.53, 0.45], [0.37, 0.48], [0.2, 0.54]],
  lowerFrontShin: [[0.5, 0.51], [0.58, 0.49], [0.55, 0.33], [0.46, 0.29], [0.4, 0.34], [0.43, 0.43]],
  lowerFoldedLeg: [[0.04, 0.57], [0.2, 0.53], [0.34, 0.43], [0.26, 0.34], [0.11, 0.31], [-0.04, 0.37], [-0.11, 0.47]],
  lowerTorso: [[0.08, 0.59], [0.08, 0.73], [0.15, 0.88], [0.28, 0.93], [0.4, 0.86], [0.39, 0.72], [0.29, 0.61], [0.2, 0.56]],
  lowerHead: [[0.11, 0.91], [0.12, 1.04], [0.23, 1.12], [0.34, 1.06], [0.35, 0.94], [0.24, 0.87]],
  lowerLinkedArm: [[0.29, 0.81], [0.21, 0.85], [0.1, 0.94], [0.12, 1.02], [0.2, 1.04], [0.23, 1.01], [0.31, 1.07], [0.37, 1.02], [0.29, 0.94], [0.39, 0.85]],
  lowerRestingArm: [[0.3, 0.75], [0.4, 0.72], [0.5, 0.57], [0.44, 0.51], [0.34, 0.66], [0.25, 0.68]],
  clasp: [[0.18, 1.0], [0.23, 1.04], [0.29, 1.09], [0.34, 1.05], [0.31, 0.99], [0.25, 0.97]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

export type SuhayV7ShapeName = keyof typeof SUHAY_HUSAY_V7_SHAPES;

/** Projection for the V7 compact landmark icon; earlier projections remain untouched. */
export function suhayHusayV7SymbolPoint(point: readonly number[]): [number, number] {
  return [16 + point[0] * 17.5, 28 - point[1] * 12.4];
}

/** V8 is a cleaner profile built from continuous body silhouettes. Each
 * figure's head, neck, and torso share one polygon so the sculpted forms cannot
 * visually separate at their joins. The seated figure is nested over a broad
 * raised stone seat, with its folded feet deliberately meeting the plinth. */
export const SUHAY_HUSAY_V8_SHAPES = {
  pedestal: [[-0.76, 0.34], [0.76, 0.34], [0.92, -0.18], [-0.92, -0.18]],
  pedestalTop: [[-0.78, 0.34], [0.78, 0.34], [0.86, 0.24], [-0.86, 0.24]],
  pedestalFacet: [[-0.70, 0.20], [-0.14, 0.32], [-0.18, -0.13], [-0.84, -0.18]],
  outcrop: [[-0.70, 0.27], [-0.55, 0.47], [-0.33, 0.45], [-0.13, 0.65], [0.12, 0.55], [0.34, 0.49], [0.62, 0.35], [0.50, 0.27], [-0.42, 0.24]],
  outcropFacet: [[-0.53, 0.45], [-0.33, 0.45], [-0.13, 0.65], [0.10, 0.53], [-0.08, 0.31], [-0.42, 0.24]],
  seatedSupport: [[0.04, 0.43], [0.13, 0.59], [0.35, 0.62], [0.56, 0.48], [0.48, 0.37], [0.20, 0.35]],

  standingLeftLeg: [[-0.32, 0.97], [-0.17, 0.95], [-0.28, 0.64], [-0.49, 0.36], [-0.67, 0.34], [-0.60, 0.44], [-0.40, 0.73]],
  standingRightLeg: [[0.00, 0.98], [0.17, 0.95], [0.36, 0.66], [0.58, 0.36], [0.43, 0.34], [0.26, 0.47], [0.05, 0.75]],
  standingCore: [[-0.34, 0.87], [-0.40, 1.10], [-0.34, 1.34], [-0.43, 1.51], [-0.49, 1.65], [-0.45, 1.81], [-0.33, 1.91], [-0.20, 1.84], [-0.20, 1.71], [-0.29, 1.58], [-0.20, 1.47], [-0.03, 1.36], [0.07, 1.17], [0.03, 0.91], [-0.13, 0.84]],
  standingRaisedArm: [[-0.34, 1.32], [-0.22, 1.36], [-0.33, 1.55], [-0.49, 1.72], [-0.48, 1.88], [-0.60, 1.91], [-0.68, 1.73], [-0.50, 1.51]],
  standingLinkedArm: [[-0.01, 1.30], [0.11, 1.34], [0.25, 1.20], [0.39, 1.06], [0.34, 0.99], [0.24, 1.03], [0.10, 1.17]],

  lowerFoldedLeg: [[0.05, 0.53], [0.19, 0.59], [0.39, 0.53], [0.55, 0.43], [0.53, 0.35], [0.39, 0.34], [0.34, 0.42], [0.17, 0.36], [0.02, 0.40]],
  lowerCore: [[0.06, 0.48], [0.04, 0.65], [0.13, 0.80], [0.23, 0.87], [0.21, 0.96], [0.13, 1.03], [0.20, 1.14], [0.34, 1.17], [0.43, 1.08], [0.40, 0.97], [0.31, 0.89], [0.35, 0.81], [0.46, 0.70], [0.43, 0.54], [0.27, 0.47]],
  lowerRestingArm: [[0.17, 0.73], [0.28, 0.76], [0.43, 0.61], [0.39, 0.54], [0.28, 0.65], [0.16, 0.64]],
  lowerLinkedArm: [[0.35, 0.81], [0.27, 0.88], [0.30, 0.98], [0.39, 1.04], [0.45, 1.00], [0.41, 0.92], [0.48, 0.85], [0.42, 0.77]],
  clasp: [[0.34, 1.00], [0.39, 1.06], [0.46, 1.04], [0.48, 0.98], [0.42, 0.94], [0.36, 0.95]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

export type SuhayV8ShapeName = keyof typeof SUHAY_HUSAY_V8_SHAPES;

/** Compact campus-map projection of V8's unified side-profile artwork. */
export function suhayHusayV8SymbolPoint(point: readonly number[]): [number, number] {
  return [16 + point[0] * 14.8, 29.2 - point[1] * 11.5];
}

/** V9 retains V8 as rollback and tightens the joins/support that read weakly
 * in the live oblique view. The lower body shifts inward, its folded foot
 * intersects the plinth top slightly, and the neck bridges are broader. */
export const SUHAY_HUSAY_V9_SHAPES = {
  ...SUHAY_HUSAY_V8_SHAPES,
  seatedSupport: [[-0.12, 0.36], [-0.08, 0.55], [0.08, 0.68], [0.36, 0.67], [0.58, 0.50], [0.49, 0.36]],
  standingLeftLeg: [[-0.32, 0.97], [-0.17, 0.95], [-0.28, 0.64], [-0.49, 0.36], [-0.67, 0.30], [-0.60, 0.42], [-0.40, 0.73]],
  standingRightLeg: [[0.00, 0.98], [0.17, 0.95], [0.36, 0.66], [0.58, 0.36], [0.43, 0.30], [0.26, 0.47], [0.05, 0.75]],
  standingCore: [[-0.34, 0.87], [-0.40, 1.10], [-0.34, 1.34], [-0.43, 1.51], [-0.49, 1.65], [-0.45, 1.81], [-0.33, 1.91], [-0.20, 1.84], [-0.20, 1.71], [-0.29, 1.58], [-0.10, 1.45], [-0.03, 1.36], [0.07, 1.17], [0.03, 0.91], [-0.13, 0.84]],
  lowerFoldedLeg: [[-0.04, 0.53], [0.10, 0.59], [0.31, 0.53], [0.47, 0.43], [0.45, 0.29], [0.31, 0.28], [0.26, 0.40], [0.09, 0.32], [-0.06, 0.40]],
  lowerCore: [[-0.02, 0.48], [-0.04, 0.65], [0.05, 0.80], [0.15, 0.87], [0.13, 0.96], [0.05, 1.03], [0.12, 1.14], [0.26, 1.17], [0.35, 1.08], [0.32, 0.97], [0.23, 0.89], [0.29, 0.79], [0.38, 0.70], [0.35, 0.54], [0.19, 0.47]],
  lowerRestingArm: [[0.09, 0.73], [0.20, 0.76], [0.35, 0.61], [0.31, 0.54], [0.20, 0.65], [0.08, 0.64]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

export type SuhayV9ShapeName = keyof typeof SUHAY_HUSAY_V9_SHAPES;

/** V9 shares the same compact 2D projection as V8. */
export function suhayHusayV9SymbolPoint(point: readonly number[]): [number, number] {
  return suhayHusayV8SymbolPoint(point);
}

/** V10 is a compact, shared side-profile composition drawn from the supplied
 * target references. The standing silhouette rises on the left; a seated
 * figure folds into the open stance on the right and reaches the same clasp.
 * The few large stone facets keep the artwork legible at campus scale. */
export const SUHAY_HUSAY_V10_SHAPES = {
  pedestal: [[-0.82, 0.24], [0.82, 0.24], [0.72, -0.16], [-0.72, -0.16]],
  pedestalTop: [[-0.78, 0.27], [0.78, 0.27], [0.82, 0.24], [-0.82, 0.24]],
  rockMass: [[-0.74, 0.20], [-0.66, 0.48], [-0.49, 0.82], [-0.40, 0.97], [-0.26, 0.62], [-0.08, 0.82], [0.13, 0.60], [0.41, 0.88], [0.63, 0.48], [0.72, 0.20]],
  rockLeftFacet: [[-0.66, 0.48], [-0.49, 0.82], [-0.40, 0.97], [-0.26, 0.62], [-0.36, 0.25], [-0.67, 0.20]],
  rockCenterFacet: [[-0.49, 0.82], [-0.40, 0.97], [-0.26, 0.62], [-0.08, 0.82], [0.13, 0.60], [0.02, 0.25], [-0.36, 0.25]],
  seatedSupport: [[-0.04, 0.40], [0.02, 0.68], [0.20, 0.78], [0.48, 0.62], [0.58, 0.42], [0.34, 0.30]],

  standingLeftLeg: [[-0.34, 1.48], [-0.18, 1.48], [-0.24, 1.13], [-0.43, 0.76], [-0.62, 0.30], [-0.79, 0.27], [-0.68, 0.48], [-0.49, 0.92]],
  standingRightLeg: [[-0.04, 1.48], [0.13, 1.43], [0.26, 1.10], [0.40, 0.78], [0.62, 0.29], [0.45, 0.27], [0.22, 0.47], [0.04, 0.92]],
  standingCore: [[-0.44, 1.91], [-0.48, 2.04], [-0.43, 2.17], [-0.40, 2.34], [-0.29, 2.46], [-0.16, 2.40], [-0.14, 2.25], [-0.20, 2.12], [-0.08, 2.04], [0.05, 1.94], [0.08, 1.75], [0.04, 1.49], [-0.12, 1.40], [-0.34, 1.49], [-0.48, 1.66]],
  standingHeadFacet: [[-0.40, 2.31], [-0.29, 2.43], [-0.18, 2.39], [-0.16, 2.27], [-0.23, 2.17], [-0.34, 2.20]],
  standingCoreFacet: [[-0.42, 2.02], [-0.32, 2.17], [-0.19, 2.12], [0.02, 1.93], [-0.09, 1.67], [-0.36, 1.73]],
  standingFreeArm: [[-0.42, 1.96], [-0.53, 1.98], [-0.62, 1.80], [-0.59, 1.60], [-0.48, 1.47], [-0.36, 1.52], [-0.43, 1.70]],
  standingLinkedArm: [[-0.01, 1.94], [0.10, 1.91], [0.19, 1.72], [0.28, 1.52], [0.40, 1.37], [0.32, 1.28], [0.20, 1.39], [0.08, 1.60]],

  lowerFoldedLeg: [[-0.02, 0.58], [0.12, 0.72], [0.33, 0.70], [0.58, 0.53], [0.57, 0.40], [0.42, 0.37], [0.28, 0.48], [0.08, 0.37], [-0.12, 0.40]],
  lowerCore: [[0.00, 0.58], [-0.02, 0.78], [0.07, 0.98], [0.18, 1.10], [0.20, 1.21], [0.29, 1.31], [0.42, 1.28], [0.49, 1.17], [0.44, 1.08], [0.36, 1.01], [0.43, 0.92], [0.47, 0.75], [0.37, 0.60], [0.19, 0.54]],
  lowerHeadFacet: [[0.21, 1.21], [0.30, 1.30], [0.41, 1.28], [0.47, 1.18], [0.42, 1.12], [0.31, 1.14]],
  lowerCoreFacet: [[0.05, 0.84], [0.18, 1.06], [0.29, 1.15], [0.40, 1.06], [0.40, 0.90], [0.27, 0.72]],
  lowerRestingArm: [[0.11, 0.90], [0.22, 0.96], [0.37, 0.78], [0.33, 0.69], [0.20, 0.82], [0.08, 0.78]],
  lowerLinkedArm: [[0.34, 1.02], [0.26, 1.11], [0.28, 1.22], [0.37, 1.32], [0.44, 1.29], [0.42, 1.20], [0.48, 1.13], [0.43, 1.05]],
  clasp: [[0.34, 1.29], [0.39, 1.35], [0.46, 1.34], [0.49, 1.28], [0.44, 1.22], [0.37, 1.23]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

export type SuhayV10ShapeName = keyof typeof SUHAY_HUSAY_V10_SHAPES;

/** Narrow, taller footprint matching the supplied 2D target without changing
 * the authored campus asset bounds or location. */
export function suhayHusayV10SymbolPoint(point: readonly number[]): [number, number] {
  return [16 + point[0] * 13.4, 29.1 - point[1] * 10.65];
}

/** V11 is a cleaner, narrower side-profile composition. The continuous upper
 * torso includes its neck/head silhouette; the compact lower figure folds
 * inside the stance and overlaps the same rising stone support in both views. */
export const SUHAY_HUSAY_V11_SHAPES = {
  pedestal: [[-0.78, 0.22], [0.78, 0.22], [0.68, -0.13], [-0.68, -0.13]],
  rockMass: [[-0.69, 0.20], [-0.61, 0.48], [-0.43, 0.77], [-0.31, 0.93], [-0.18, 0.62], [0.02, 0.75], [0.22, 0.57], [0.45, 0.79], [0.63, 0.47], [0.69, 0.20]],
  rockLeftFacet: [[-0.61, 0.48], [-0.43, 0.77], [-0.31, 0.93], [-0.18, 0.62], [-0.32, 0.25], [-0.65, 0.20]],
  rockRightFacet: [[0.02, 0.75], [0.22, 0.57], [0.45, 0.79], [0.63, 0.47], [0.47, 0.25], [0.08, 0.25]],
  standingLeftLeg: [[-0.30, 1.50], [-0.14, 1.48], [-0.22, 1.10], [-0.39, 0.77], [-0.57, 0.25], [-0.73, 0.22], [-0.64, 0.47], [-0.48, 0.92]],
  standingRightLeg: [[-0.04, 1.49], [0.12, 1.45], [0.24, 1.10], [0.30, 0.77], [0.52, 0.25], [0.36, 0.22], [0.17, 0.48], [0.02, 0.93]],
  standingCore: [[-0.36, 1.89], [-0.43, 2.03], [-0.39, 2.19], [-0.34, 2.35], [-0.42, 2.48], [-0.46, 2.62], [-0.36, 2.72], [-0.23, 2.67], [-0.17, 2.54], [-0.20, 2.41], [-0.10, 2.28], [0.00, 2.08], [0.07, 1.91], [0.02, 1.69], [0.02, 1.48], [-0.14, 1.42], [-0.32, 1.50], [-0.43, 1.67]],
  standingCoreFacet: [[-0.37, 2.02], [-0.29, 2.29], [-0.20, 2.41], [-0.09, 2.26], [0.00, 2.04], [-0.10, 1.75], [-0.32, 1.73]],
  standingFreeArm: [[-0.39, 1.98], [-0.51, 1.99], [-0.61, 1.77], [-0.55, 1.55], [-0.44, 1.49], [-0.34, 1.57], [-0.41, 1.74]],
  standingLinkedArm: [[-0.01, 2.02], [0.10, 1.98], [0.18, 1.78], [0.28, 1.55], [0.38, 1.38], [0.29, 1.30], [0.18, 1.43], [0.07, 1.66]],
  lowerFoldedLeg: [[-0.34, 0.44], [-0.23, 0.63], [-0.05, 0.69], [0.15, 0.62], [0.35, 0.43], [0.32, 0.29], [0.16, 0.27], [0.01, 0.43], [-0.18, 0.31], [-0.34, 0.34]],
  lowerCore: [[-0.26, 0.55], [-0.24, 0.76], [-0.14, 0.95], [0.00, 1.08], [0.05, 1.23], [0.16, 1.31], [0.28, 1.25], [0.31, 1.13], [0.21, 1.04], [0.27, 0.91], [0.25, 0.72], [0.11, 0.57], [-0.06, 0.52]],
  lowerCoreFacet: [[-0.13, 0.82], [0.00, 1.04], [0.14, 1.15], [0.24, 1.06], [0.19, 0.86], [0.05, 0.69]],
  lowerRestingArm: [[-0.11, 0.88], [0.00, 0.93], [0.15, 0.77], [0.10, 0.67], [-0.04, 0.78], [-0.15, 0.75]],
  lowerLinkedArm: [[0.22, 1.02], [0.15, 1.10], [0.17, 1.22], [0.26, 1.34], [0.35, 1.30], [0.33, 1.20], [0.40, 1.13], [0.35, 1.05]],
  clasp: [[0.33, 1.31], [0.37, 1.37], [0.44, 1.35], [0.47, 1.29], [0.42, 1.24], [0.35, 1.25]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

export type SuhayV11ShapeName = keyof typeof SUHAY_HUSAY_V11_SHAPES;

/** Compact tall symbol projection for the Student 2D campus map. */
export function suhayHusayV11SymbolPoint(point: readonly number[]): [number, number] {
  return [16 + point[0] * 13.4, 29.1 - point[1] * 10.65];
}
