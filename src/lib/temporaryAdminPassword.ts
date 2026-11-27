const CHARACTER_GROUPS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnopqrstuvwxyz',
  '23456789',
  '!@#$%&*?'
] as const;

const ALL_CHARACTERS = CHARACTER_GROUPS.join('');

function secureIndex(limit: number): number {
  const random = new Uint32Array(1);
  const ceiling = Math.floor(0x1_0000_0000 / limit) * limit;
  do {
    globalThis.crypto.getRandomValues(random);
  } while (random[0] >= ceiling);
  return random[0] % limit;
}

export function generateTemporaryAdminPassword(): string {
  const characters = CHARACTER_GROUPS.map(group => group[secureIndex(group.length)]);
  while (characters.length < 20) characters.push(ALL_CHARACTERS[secureIndex(ALL_CHARACTERS.length)]);
  for (let index = characters.length - 1; index > 0; index--) {
    const swapIndex = secureIndex(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join('');
}
