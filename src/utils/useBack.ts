import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * 返回上一页；无应用内历史（直接打开/刷新/分享链接进入）时回退到指定父级路由。
 * 依据 React Router history 写入 window.history.state 的 idx（>0 表示应用内可后退）。
 */
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, fallback])
}
