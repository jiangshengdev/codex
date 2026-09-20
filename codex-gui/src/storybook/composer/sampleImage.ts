export function createSampleImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  if (context == null) throw new Error("Sample image requires a canvas context");
  context.fillStyle = "#dbeafe";
  context.fillRect(0, 0, 320, 180);
  context.fillStyle = "#2563eb";
  context.fillRect(40, 40, 120, 100);
  context.fillStyle = "#f59e0b";
  context.beginPath();
  context.arc(235, 90, 45, 0, Math.PI * 2);
  context.fill();
  const dataUrl = canvas.toDataURL("image/png");
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (char) =>
    char.charCodeAt(0),
  );
  return new File([bytes], "sample.png", { type: "image/png" });
}
