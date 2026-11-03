// Recognition only: never usable for password authentication or session access.
export const LEGACY_BOOTSTRAP_HASH =
  "scrypt$16384$8$1$DiQ+q1qbZruivKGHhq4U6Q==$k3SD+tIebz7KXvjNkyBmOFH48BSFlu8s2dMsanCUmH7GveHdEPW53JbVqMJ9S6lYxYg0chxbGKPhVa9HjdjcXg==";

export const isRetiredCredential = (hash: string): boolean => hash === LEGACY_BOOTSTRAP_HASH;
