const DICEBEAR_BASE = "https://api.dicebear.com/9.x/avataaars/svg";

export const AVATAR_PRESETS = [
  `${DICEBEAR_BASE}?seed=m1&top=shortFlat&hairColor=2c1b18&facialHairProbability=0&clothing=hoodie`,
  `${DICEBEAR_BASE}?seed=m2&top=shortWaved&hairColor=724133&facialHairProbability=0&clothing=shirtCrewNeck`,
  `${DICEBEAR_BASE}?seed=m3&top=shortRound&hairColor=4a312c&facialHair=beardLight&facialHairProbability=100&clothing=collarAndSweater`,
  `${DICEBEAR_BASE}?seed=m4&top=theCaesar&hairColor=2c1b18&facialHair=beardMedium&facialHairProbability=100&clothing=blazerAndShirt&accessories=prescription02&accessoriesProbability=100`,
  `${DICEBEAR_BASE}?seed=m5&top=shortFlat&hairColor=574138&facialHair=beardLight&facialHairProbability=100&clothing=blazerAndSweater&accessoriesProbability=0`,
  `${DICEBEAR_BASE}?seed=f1&top=bigHair&hairColor=c93305&facialHairProbability=0&clothing=graphicShirt`,
  `${DICEBEAR_BASE}?seed=f2&top=curly&hairColor=b58143&facialHairProbability=0&clothing=shirtVNeck`,
  `${DICEBEAR_BASE}?seed=f3&top=straight02&hairColor=724133&facialHairProbability=0&clothing=collarAndSweater`,
  `${DICEBEAR_BASE}?seed=f4&top=bun&hairColor=4a312c&facialHairProbability=0&clothing=blazerAndSweater&accessories=prescription01&accessoriesProbability=100`,
  `${DICEBEAR_BASE}?seed=f5&top=bob&hairColor=6b4423&facialHairProbability=0&clothing=blazerAndShirt&accessoriesProbability=0`,
];

export function randomAvatarPreset(): string {
  return AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
}
