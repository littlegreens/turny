const HEX = /^#[0-9A-Fa-f]{6}$/;

export function resolveMemberRowColor(input: {
  calendarConstraintColor: string | null | undefined;
  orgDefaultColor: string | null | undefined;
  orgUseDefaultInCalendars: boolean;
}): string | null {
  const cal = input.calendarConstraintColor?.trim();
  if (cal && HEX.test(cal)) return cal;
  if (input.orgUseDefaultInCalendars) {
    const o = input.orgDefaultColor?.trim();
    if (o && HEX.test(o)) return o;
  }
  return null;
}
