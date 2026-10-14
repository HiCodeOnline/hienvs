// window.api 全局类型声明
import type { Api } from '../../preload/index'

declare global {
  interface Window {
    api: Api
  }
}

export {}
