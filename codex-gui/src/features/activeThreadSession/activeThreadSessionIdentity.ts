/** Identifies one live owner, independently of its local revision or subscription. */
export type ActiveThreadSessionIdentity = Readonly<{
  threadId: string;
  instanceId: string;
}>;

let nextInstanceId = 0;

/** Allocate once per live owner; viewing an existing owner keeps its identity. */
export function createActiveThreadSessionIdentity(threadId: string): ActiveThreadSessionIdentity {
  nextInstanceId += 1;
  return { threadId, instanceId: `active-thread-session-${String(nextInstanceId)}` };
}
