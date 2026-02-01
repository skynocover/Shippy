import { nanoid, customAlphabet } from 'nanoid';

export function generateId(): string {
  return nanoid(21);
}

const subdomainAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

export function generateSubdomain(): string {
  return subdomainAlphabet();
}
