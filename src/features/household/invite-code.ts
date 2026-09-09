// Short, human-shareable invite codes — e.g. "RZ7K2P". Six characters from an
// unambiguous alphabet (no 0/O, 1/I/L) so a roommate can read one off a screen
// or say it out loud without confusion. ~730M combinations — collisions are
// vanishingly rare for a household app, and access is still gated by the code
// itself (a stranger can't see or join a home without knowing it).

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const LENGTH = 6;

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// Shape check for "did the user paste a code into the home-name box?"
export const INVITE_CODE_SHAPE = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`, 'i');

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}
