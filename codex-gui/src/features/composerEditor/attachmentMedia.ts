export function attachmentMedia(file: File): "file" | "image" {
  if (
    /^image\/(png|jpeg|gif|webp)$/.test(file.type) ||
    (file.type === "" && /\.(png|jpe?g|gif|webp)$/i.test(file.name))
  )
    return "image";
  return "file";
}

export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|heic|heif|svg|avif|bmp|tiff?)$/i.test(file.name)
  );
}
