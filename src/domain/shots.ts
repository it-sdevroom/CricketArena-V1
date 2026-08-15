/**
 * The phrases a scorer can attach to a ball.
 *
 * Offered as presets rather than free typing, because a scorer has a few
 * seconds between deliveries and cannot be composing prose. The options shown
 * depend on what actually happened: there is no point offering "driven through
 * the covers" for a wicket, or "edged behind" for a dot ball.
 *
 * The stored value is free text, so anything here can be edited later and new
 * phrases need no migration.
 */

export interface ShotOption {
  label: string;
  /** The phrase written into commentary. */
  text: string;
}

/** Shots that bring up a boundary four. */
export const FOUR_SHOTS: ShotOption[] = [
  { label: 'Cover drive', text: 'driven through the covers' },
  { label: 'Straight', text: 'driven straight back past the bowler' },
  { label: 'Square cut', text: 'cut square of the wicket' },
  { label: 'Pull', text: 'pulled through midwicket' },
  { label: 'Flick', text: 'flicked off the pads' },
  { label: 'Sweep', text: 'swept fine' },
  { label: 'Edge', text: 'edged past the slips' },
  { label: 'Glance', text: 'glanced down to fine leg' },
];

/** Shots that clear the rope. */
export const SIX_SHOTS: ShotOption[] = [
  { label: 'Over midwicket', text: 'slog-swept over midwicket' },
  { label: 'Straight', text: 'launched straight down the ground' },
  { label: 'Over long-on', text: 'lofted over long-on' },
  { label: 'Over long-off', text: 'driven over long-off' },
  { label: 'Pull', text: 'pulled into the stands' },
  { label: 'Ramp', text: 'ramped over the keeper' },
  { label: 'Reverse', text: 'reverse-swept over point' },
];

/** Ordinary scoring shots, one to three runs. */
export const RUN_SHOTS: ShotOption[] = [
  { label: 'Off side', text: 'pushed into the off side' },
  { label: 'Leg side', text: 'worked away on the leg side' },
  { label: 'Down ground', text: 'driven down the ground' },
  { label: 'Cut', text: 'cut behind point' },
  { label: 'Pull', text: 'pulled to midwicket' },
  { label: 'Sweep', text: 'swept to square leg' },
  { label: 'Inside edge', text: 'off the inside edge' },
  { label: 'Quick single', text: 'dropped into the off side for a quick single' },
];

/** No run: how it was kept out. */
export const DOT_SHOTS: ShotOption[] = [
  { label: 'Defended', text: 'defended solidly' },
  { label: 'Left alone', text: 'left alone outside off' },
  { label: 'Beaten', text: 'beaten outside off' },
  { label: 'Played and missed', text: 'played and missed' },
  { label: 'To fielder', text: 'straight to the fielder' },
  { label: 'Bouncer', text: 'ducked under a bouncer' },
  { label: 'Yorker', text: 'digs out a yorker' },
  { label: 'Appeal', text: 'big appeal, turned down' },
];

/** How a wicket fell, keyed by dismissal kind. */
export const WICKET_SHOTS: Record<string, ShotOption[]> = {
  bowled: [
    { label: 'Through the gate', text: 'through the gate' },
    { label: 'Off stump', text: 'off stump knocked back' },
    { label: 'Inside edge', text: 'inside edge onto the stumps' },
    { label: 'Yorker', text: 'yorked' },
    { label: 'Missed sweep', text: 'missed the sweep and paid for it' },
  ],
  caught: [
    { label: 'To mid-off', text: 'skied to mid-off' },
    { label: 'Long-on', text: 'holed out to long-on' },
    { label: 'Deep midwicket', text: 'picked out deep midwicket' },
    { label: 'Slip', text: 'edged to slip' },
    { label: 'Sharp catch', text: 'brilliant catch' },
    { label: 'Toe end', text: 'off the toe end, straight up' },
  ],
  caught_behind: [
    { label: 'Thin edge', text: 'thin edge through to the keeper' },
    { label: 'Away swinger', text: 'edged the away swinger' },
  ],
  lbw: [
    { label: 'Trapped', text: 'trapped plumb in front' },
    { label: 'Missed flick', text: 'missed the flick, struck on the pad' },
    { label: 'Skidded on', text: 'skidded on and hit him low' },
  ],
  stumped: [
    { label: 'Down the track', text: 'came down the track and missed' },
    { label: 'Quick hands', text: 'lightning work by the keeper' },
  ],
  run_out: [
    { label: 'Direct hit', text: 'direct hit, and he is short' },
    { label: 'Mix-up', text: 'terrible mix-up between the batters' },
    { label: 'Sent back', text: 'sent back and could not make it' },
    { label: 'Great throw', text: 'superb throw from the deep' },
  ],
  hit_wicket: [{ label: 'On the stumps', text: 'stepped back onto his own stumps' }],
  caught_and_bowled: [{ label: 'Return catch', text: 'sharp return catch' }],
};

/**
 * Pick the right set of phrases for what just happened.
 * `wicketKind` wins, then boundaries, then runs, then a dot.
 */
export function shotOptionsFor(input: {
  runsOffBat: number;
  wicketKind?: string | null;
  isWide?: boolean;
  isNoBall?: boolean;
  byes?: number;
  legByes?: number;
}): ShotOption[] {
  if (input.wicketKind) {
    return WICKET_SHOTS[input.wicketKind] ?? [];
  }
  if (input.isWide) {
    return [
      { label: 'Down leg', text: 'sliding down the leg side' },
      { label: 'Too wide', text: 'way outside off' },
    ];
  }
  if (input.byes || input.legByes) {
    return [
      { label: 'Off the pad', text: 'off the pad and away' },
      { label: 'Past keeper', text: 'through the keeper' },
    ];
  }
  if (input.runsOffBat === 6) return SIX_SHOTS;
  if (input.runsOffBat === 4) return FOUR_SHOTS;
  if (input.runsOffBat > 0) return RUN_SHOTS;
  return DOT_SHOTS;
}
