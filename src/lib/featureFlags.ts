/**
 * 功能开关配置
 *
 * 使用方式：
 * 1. 本地测试：localStorage.setItem('feature_realtime_sync', 'true')
 * 2. 生产环境：通过 Netlify 环境变量 VITE_ENABLE_REALTIME_SYNC=true
 */

/**
 * 是否启用实时同步架构
 *
 * 旧架构：轮询 + 乐观锁（当前生产环境）
 * 新架构：Realtime + 操作日志（推荐）
 */
export function isRealtimeSyncEnabled(): boolean {
  // 优先检查 localStorage（开发测试用）
  const localFlag = localStorage.getItem('feature_realtime_sync');
  if (localFlag === 'true') return true;
  if (localFlag === 'false') return false;

  // 检查环境变量（生产部署用）
  if (import.meta.env.VITE_ENABLE_REALTIME_SYNC === 'true') {
    return true;
  }

  // 默认关闭，使用旧架构
  return false;
}

/**
 * 启用实时同步（开发测试用）
 */
export function enableRealtimeSync(): void {
  localStorage.setItem('feature_realtime_sync', 'true');
  console.log('[Feature Flag] 实时同步已启用，请刷新页面');
}

/**
 * 禁用实时同步，回退到旧架构（开发测试用）
 */
export function disableRealtimeSync(): void {
  localStorage.setItem('feature_realtime_sync', 'false');
  console.log('[Feature Flag] 实时同步已禁用，将使用旧架构，请刷新页面');
}

// 暴露到 window 供控制台调试
if (typeof window !== 'undefined') {
  (window as any).__enableRealtimeSync = enableRealtimeSync;
  (window as any).__disableRealtimeSync = disableRealtimeSync;
}
