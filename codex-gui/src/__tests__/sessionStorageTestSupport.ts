export function withSessionStorageGetter(get: () => Storage | undefined, run: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get });
  try {
    run();
  } finally {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, "sessionStorage");
    } else {
      Object.defineProperty(globalThis, "sessionStorage", descriptor);
    }
  }
}
