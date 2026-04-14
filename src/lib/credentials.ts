/**
 * Static login credentials. In production, replace with a proper auth provider.
 * Passwords are stored as bcrypt hashes but we use a simple hash here for demo.
 */
export const CREDENTIALS: Array<{
  userId: number
  email: string
  password: string
}> = [
  { userId: 1, email: 's.klein@buena.de',                 password: 'Portco#HQ24' },
  { userId: 2, email: 'l.mueller@hamburg-immo.de',         password: 'Hamburg#24' },
  { userId: 3, email: 'a.schmidt@berlin-residenz.de',      password: 'Berlin#24' },
]

export function findCredential(email: string, password: string) {
  return CREDENTIALS.find(
    (c) =>
      c.email.toLowerCase() === email.toLowerCase() &&
      c.password === password
  ) ?? null
}
