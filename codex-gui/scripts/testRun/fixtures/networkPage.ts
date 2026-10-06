/// <reference types="vite/client" />
/// <reference lib="dom" />

if (import.meta.hot) {
  import.meta.hot.on("network-reply", (message: string) => {
    document.body.dataset.networkReply = message;
  });
  import.meta.hot.send("network-probe", "network-round-trip");
}
