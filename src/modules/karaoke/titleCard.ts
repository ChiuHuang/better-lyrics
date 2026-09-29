const TITLE_CARD_MIN_INTRO_S = 5;
const TITLE_CARD_START_S = 0.5;
// The last stretch before the first line belongs to the stage, so an intro note can fill as the count in.
const TITLE_CARD_CLEAR_S = 2.5;

interface TitleCardInput {
  firstSungLineStartS: number;
  timeS: number;
}

export function isTitleCardVisible({ firstSungLineStartS, timeS }: TitleCardInput): boolean {
  return (
    firstSungLineStartS >= TITLE_CARD_MIN_INTRO_S &&
    Number.isFinite(firstSungLineStartS) &&
    timeS >= TITLE_CARD_START_S &&
    timeS < firstSungLineStartS - TITLE_CARD_CLEAR_S
  );
}
