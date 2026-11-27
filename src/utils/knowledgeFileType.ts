export const VIDEO_FILE_EXTENSIONS = ['.mp4', '.webm'] as const

// 做什么：让上传校验和请求超时使用同一组视频后缀
// 入参：含后缀的文件名
// 返回：MP4 或 WebM 时为 true，忽略大小写
export function isVideoFilename(filename: string): boolean {
  const lowercaseName = filename.toLowerCase()
  return VIDEO_FILE_EXTENSIONS.some((extension) => lowercaseName.endsWith(extension))
}
