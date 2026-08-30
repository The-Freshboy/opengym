// Keep source IDs/media and training history stable while making common names discoverable.
export const FLY_NAMES = {
  '0308': 'chest fly — dumbbell (flat bench)',
  '0319': 'chest fly — dumbbell (incline bench)',
  '0302': 'chest fly — dumbbell (decline bench)',
  '0227': 'chest fly — cable (standing)',
  '0188': 'chest fly — cable (mid-height)',
  '0179': 'chest fly — cable (low to high)',
  '0158': 'chest fly — cable (decline)',
  '0171': 'chest fly — cable (incline bench)',
  '0185': 'chest fly — cable (lying on bench)',
  '0596': 'chest fly — machine (pec deck)',
  '0383': 'rear delt fly — dumbbell (reverse fly)',
  '0378': 'rear delt fly — dumbbell (rear fly)',
  '0359': 'rear delt fly — dumbbell (single arm, supported)',
  '0154': 'rear delt fly — cable (reverse crossover)',
  '0225': 'rear delt fly — cable (high reverse fly)',
  '0240': 'rear delt fly — cable (supine)',
  '0602': 'rear delt fly — machine (reverse pec deck)',
  '0601': 'rear delt fly — machine (parallel grip)',
  '0993': 'rear delt fly — resistance band'
}
export function withCommonExerciseName(exercise) {
  const name = FLY_NAMES[exercise.id]
  if (!name) return exercise
  return { ...exercise, n: name, desc: [exercise.desc, `Also called: ${exercise.n}. ${name.startsWith('chest') ? 'Chest flyes, chest flies, pec fly, butterfly.' : 'Rear deltoid flyes, rear delt flies, reverse flyes, reverse flies.'}`].filter(Boolean).join(' ') }
}
