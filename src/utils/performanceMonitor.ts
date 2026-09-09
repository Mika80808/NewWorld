/**
 * 滾動效能量測（僅 DEV）。
 *
 * 只記滾動：`recordRender()` 從來沒有被呼叫過，於是 `renderEvents` 永遠是空陣列、
 * `getRenderMetrics()` 永遠回傳零、報告裡那半段永遠印不出東西——連同
 * `PerformanceMetrics` 上的 `renderDuration` / `domNodeCount` 兩個欄位一併移除。
 * 要量渲染的話該用 React Profiler，而不是把這個模組再補回來。
 *
 * 正式版不計時也不累積記錄，呼叫端（App.tsx 的 onScroll）以
 * `import.meta.env.DEV` 擋在外面。
 */

interface PerformanceMetrics {
  scrollDuration: number;        // 滾動事件耗時（ms）
  messageCount: number;          // 訊息數
  isLongTask: boolean;           // 是否超過 50ms
  timestamp: number;             // 記錄時間戳
}

const LONG_TASK_THRESHOLD = 50;  // ms

class PerformanceMonitor {
  private scrollEvents: PerformanceMetrics[] = [];
  private maxRecords = 100;  // 只保留最近 100 筆記錄

  /**
   * 記錄滾動事件耗時
   * @param duration 單次滾動事件耗時（ms）
   * @param messageCount 當前訊息數
   */
  recordScrollEvent(duration: number, messageCount: number = 0): void {
    const isLongTask = duration > LONG_TASK_THRESHOLD;

    const metrics: PerformanceMetrics = {
      scrollDuration: duration,
      messageCount,
      isLongTask,
      timestamp: Date.now(),
    };

    this.scrollEvents.push(metrics);
    if (this.scrollEvents.length > this.maxRecords) {
      this.scrollEvents.shift();
    }

    if (isLongTask) {
      console.warn(
        `⚠️ Scroll long task: ${duration.toFixed(2)}ms (messages: ${messageCount})`,
        metrics
      );
    }
  }

  /**
   * 獲取滾動性能統計
   */
  getScrollMetrics(): {
    events: PerformanceMetrics[];
    avgDuration: number;
    maxDuration: number;
    longTaskCount: number;
    longTaskPercentage: number;
  } {
    if (this.scrollEvents.length === 0) {
      return {
        events: [],
        avgDuration: 0,
        maxDuration: 0,
        longTaskCount: 0,
        longTaskPercentage: 0,
      };
    }

    const durations = this.scrollEvents.map(e => e.scrollDuration);
    const longTasks = this.scrollEvents.filter(e => e.isLongTask).length;

    return {
      events: [...this.scrollEvents],
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      longTaskCount: longTasks,
      longTaskPercentage: (longTasks / this.scrollEvents.length) * 100,
    };
  }

  /** 清除所有記錄 */
  clear(): void {
    this.scrollEvents = [];
  }

  /** 輸出性能報告（用於調試） */
  generateReport(): string {
    const m = this.getScrollMetrics();
    return `
=== Performance Report ===
Scroll Events: ${m.events.length}
  Avg: ${m.avgDuration.toFixed(2)}ms
  Max: ${m.maxDuration.toFixed(2)}ms
  Long Tasks: ${m.longTaskCount} (${m.longTaskPercentage.toFixed(1)}%)
    `;
  }
}

// 單例實例，全應用共享
export const performanceMonitor = new PerformanceMonitor();
