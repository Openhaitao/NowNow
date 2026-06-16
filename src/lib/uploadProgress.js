// 图片上传进度的旁路 store：insertImageFromFile 写进度、ResizableImage 按自己的 blob src 订阅。
// 关键：进度不进节点 attrs（否则 autosave 每个百分点狂存 + 把临时进度写进库）——纯内存、传完即清。
const progress = new Map() // blobUrl -> percent(0..100)
const subs = new Map() // blobUrl -> Set<fn>

export function setUploadProgress(blobUrl, percent) {
  progress.set(blobUrl, percent)
  const set = subs.get(blobUrl)
  if (set) set.forEach((fn) => fn(percent))
}

export function getUploadProgress(blobUrl) {
  return progress.has(blobUrl) ? progress.get(blobUrl) : null
}

export function subscribeUploadProgress(blobUrl, fn) {
  let set = subs.get(blobUrl)
  if (!set) { set = new Set(); subs.set(blobUrl, set) }
  set.add(fn)
  return () => { set.delete(fn); if (set.size === 0) subs.delete(blobUrl) }
}

export function clearUploadProgress(blobUrl) {
  progress.delete(blobUrl)
  subs.delete(blobUrl)
}
