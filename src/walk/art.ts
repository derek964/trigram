/** Shipped transparent pose. Corners are alpha 0. One blob, not a sheet. */
export const HUNTER_URL = "art/hunter.png";
export const FLAG_URL = "art/camp-flag.png";
export const PATH_URLS = ["art/path-pad.png", "art/path-pad-v2.png"] as const;
export const GRASS_URLS = ["art/grass-tuft-v2.png", "art/grass-tuft.png"] as const;

/**
 * Missing for a sprite walker: no north/east/south/west sheet and no walk frames.
 * hunter.png is one 1024² RGBA pose facing screen-right. It is the interim
 * picture. Four-direction walk sheets, when they pass src/walk/walk-sheets.ts,
 * replace it per direction. The single pose is not tilted into a step.
 * poacher.png and rabbit.png are the same kind of single pose.
 * wall-paper.png and wall-paper-v1.png are the same file (identical sha256).
 */
export const FACING_SHEET_COUNT = 0;
export const WALK_FRAME_COUNT = 0;
