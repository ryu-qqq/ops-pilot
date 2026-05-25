// run 종료 후 도메인별 후처리 훅. feedback eval parser 등이 구독한다.

type RunCompletionHandler = (runId: string) => void | Promise<void>;

const handlers: RunCompletionHandler[] = [];

export function onRunCompleted(handler: RunCompletionHandler): void {
  handlers.push(handler);
}

export function notifyRunCompleted(runId: string): void {
  for (const handler of handlers) {
    void Promise.resolve(handler(runId)).catch((e: unknown) => {
      console.error("[run-completion]", e);
    });
  }
}
