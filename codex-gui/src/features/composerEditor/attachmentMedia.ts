export function attachmentMedia(file: File): "file" | "image" | "unsupportedImage" {
  if (
    /^image\/(png|jpeg|gif|webp)$/.test(file.type) ||
    (file.type === "" && /\.(png|jpe?g|gif|webp)$/i.test(file.name))
  )
    return "image";
  if (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|heic|heif|svg|avif|bmp|tiff?)$/i.test(file.name)
  )
    return "unsupportedImage";
  return "file";
}
