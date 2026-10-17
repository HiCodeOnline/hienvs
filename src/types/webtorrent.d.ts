// webtorrent v3 未内置类型声明，这里仅声明下载器用到的最小 API 面
declare module 'webtorrent' {
  /** 种子内的文件 */
  export interface TorrentFile {
    name: string
    /** 相对种子根目录的路径（分隔符为 / 或 \） */
    path: string
    /** 字节数 */
    length: number
  }

  export interface Torrent extends NodeJS.EventEmitter {
    infoHash: string
    name: string
    /** 种子总字节数 */
    length: number
    /** 已通过分片校验的字节数 */
    downloaded: number
    /** 下载速度（字节/秒） */
    downloadSpeed: number
    /** 是否下载完成 */
    done: boolean
    files: TorrentFile[]
    on(event: 'done', listener: () => void): this
    on(event: 'error', listener: (err: Error) => void): this
    on(event: 'download', listener: () => void): this
    on(event: 'noPeers', listener: (trackerType: string) => void): this
    on(event: string, listener: (...args: unknown[]) => void): this
    once(event: 'done', listener: () => void): this
  }

  export interface AddOptions {
    /** 下载存储目录 */
    path?: string
  }

  export default class WebTorrent extends NodeJS.EventEmitter {
    constructor(opts?: Record<string, unknown>)
    /** 添加种子：ontorrent 在获取到元数据（ready）时回调，返回值在元数据前即可用 */
    add(torrentId: string, opts?: AddOptions, ontorrent?: (torrent: Torrent) => void): Torrent
    /** 移除种子；destroyStore 为 true 时删除本地存储的下载文件 */
    remove(torrentId: string | Torrent, opts?: { destroyStore?: boolean }, cb?: (err?: Error) => void): void
    destroy(cb?: (err?: Error) => void): void
  }
}
