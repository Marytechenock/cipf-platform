export function getAdminPasswordChecks(password: string) {
  return {
    length: Array.from(password).length >= 8,
    uppercase: /\p{Lu}/u.test(password),
    number: /\p{N}/u.test(password),
    special: /[^\p{L}\p{N}\s]/u.test(password)
  };
}

export function isValidAdminPassword(password: string) {
  return Object.values(getAdminPasswordChecks(password)).every(Boolean)
    && new TextEncoder().encode(password).length <= 72;
}
