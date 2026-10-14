// 界面语言状态：解析生效语言并同步 <html> 的 lang / dir（RTL 适配）
import { useMemo } from 'react'
import { create } from 'zustand'
import { isRtl, hasTranslation, resolveLanguage, translate, type LanguageCode, type LanguagePreference, type Translator } from '@shared/i18n'

interface I18nState {
  /** 当前生效的界面语言 */
  language: LanguageCode
  /** 系统语言区域（用于 auto 匹配） */
  systemLocale: string
  /** 初始化：按偏好与系统语言解析语言 */
  init(systemLocale: string, pref: LanguagePreference | undefined): void
  /** 修改语言偏好（设置页选择后即时生效） */
  setPreference(pref: LanguagePreference): void
}

/** 同步 <html> 的语言与书写方向，RTL 语言由浏览器负责整体布局镜像 */
function applyDocumentLanguage(language: LanguageCode): void {
  const el = document.documentElement
  el.lang = language
  el.dir = isRtl(language) ? 'rtl' : 'ltr'
}

export const useI18nStore = create<I18nState>((set, get) => ({
  language: 'en',
  systemLocale: '',
  init(systemLocale, pref) {
    const language = resolveLanguage(pref, systemLocale)
    applyDocumentLanguage(language)
    set({ systemLocale, language })
  },
  setPreference(pref) {
    const language = resolveLanguage(pref, get().systemLocale)
    applyDocumentLanguage(language)
    set({ language })
  }
}))

/** 组件内获取翻译函数：语言切换时使用该 hook 的组件会自动重渲染 */
export function useI18n(): Translator {
  const language = useI18nStore((s) => s.language)
  return useMemo(() => (key, params) => translate(language, key, params), [language])
}

/**
 * 步骤名称：有内置文案的步骤类型按类型翻译（清单步骤一般不携带自定义标题），
 * 否则回退到任务快照中记录的标题
 */
export function useStepLabel(): (step: { type: string; title?: string }) => string {
  const language = useI18nStore((s) => s.language)
  return useMemo(
    () => (step) => {
      const key = `step.${step.type}`
      return hasTranslation(language, key) ? translate(language, key) : step.title || step.type
    },
    [language]
  )
}

/** 非组件上下文（如工具函数）取翻译函数 */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(useI18nStore.getState().language, key, params)
}

/** 当前语言代码（非组件上下文使用） */
export function currentLanguage(): LanguageCode {
  return useI18nStore.getState().language
}
