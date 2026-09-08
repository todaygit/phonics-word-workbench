// A lightweight family guard against accidental changes, not account security.
export function validParentPin(value: string) {
  return value === '1111';
}
