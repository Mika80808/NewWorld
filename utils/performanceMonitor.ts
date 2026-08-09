/**
 * Performance Monitor - Phase 1: Metrics Collection Infrastructure
 * 記錄列表滾動、渲染性能，並檢測 long task（> 50ms）
 */

export interface PerformanceMetrics {
  scrollDuration: number;        // 滾動事件耗時（ms）
  renderDuration: number;        // 組件渲染耗時（ms）
  domNodeCount: number;          // 當前 DOM 節點數
  messageCount: number;          // 訊息數
  isLongTask: boolean;           // 是否超過 50ms
  timestamp: number;             // 記錄時間戳
}

const LONG_TASK_THRESHOLD = 50;  // ms

export class PerformanceMonitor {
  private scrollEvents: PerformanceMetrics[] = [];
  private renderEvents: PerformanceMetrics[] = [];
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
      renderDuration: 0,
      domNodeCount: 0,
      messageCount,
      isLongTask,
      timestamp: Date.now(),
    };

    this.scrollEvents.push(metrics);
    if (this.scrollEvents.length > this.maxRecords) {
      this.scrollEvents.shift();
    }

    // 開發環境警告
    if (isLongTask) {
      console.warn(
        `⚠️ Scroll long task: ${duration.toFixed(2)}ms (messages: ${messageCount})`,
        metrics
      );
    }
  }

  /**
   * 記錄渲染耗時
   * @param duration 渲染耗時（ms）
   * @param domNodeCount DOM 節點數
   * @param messageCount 訊息數
   */
  recordRender(duration: number, domNodeCount: number = 0, messageCount: number = 0): void {
    const isLongTask = duration > LONG_TASK_THRESHOLD;

    const metrics: PerformanceMetrics = {
      scrollDuration: 0,
      renderDuration: duration,
      domNodeCount,
      messageCount,
      isLongTask,
      timestamp: Date.now(),
    };

    this.renderEvents.push(metrics);
    if (this.renderEvents.length > this.maxRecords) {
      this.renderEvents.shift();
    }

    if (isLongTask) {
      console.warn(
        `⚠️ Render long task: ${duration.toFixed(2)}ms (DOM nodes: ${domNodeCount}, messages: ${messageCount})`,
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

  /**
   * 獲取渲染性能統計
   */
  getRenderMetrics(): {
    events: PerformanceMetrics[];
    avgDuration: number;
    maxDuration: number;
    longTaskCount: number;
    longTaskPercentage: number;
  } {
    if (this.renderEvents.length === 0) {
      return {
        events: [],
        avgDuration: 0,
        maxDuration: 0,
        longTaskCount: 0,
        longTaskPercentage: 0,
      };
    }

    const durations = this.renderEvents.map(e => e.renderDuration);
    const longTasks = this.renderEvents.filter(e => e.isLongTask).length;

    return {
      events: [...this.renderEvents],
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      longTaskCount: longTasks,
      longTaskPercentage: (longTasks / this.renderEvents.length) * 100,
    };
  }

  /**
   * 檢查是否為 long task（> 50ms）
   */
  isLongTask(duration: number): boolean {
    return duration > LONG_TASK_THRESHOLD;
  }

  /**
   * 清除所有記錄
   */
  clear(): void {
    this.scrollEvents = [];
    this.renderEvents = [];
  }

  /**
   * 輸出性能報告（用於調試）
   */
  generateReport(): string {
    const scrollMetrics = this.getScrollMetrics();
    const renderMetrics = this.getRenderMetrics();

    return `
=== Performance Report ===
Scroll Events: ${scrollMetrics.events.length}
  Avg: ${scrollMetrics.avgDuration.toFixed(2)}ms
  Max: ${scrollMetrics.maxDuration.toFixed(2)}ms
  Long Tasks: ${scrollMetrics.longTaskCount} (${scrollMetrics.longTaskPercentage.toFixed(1)}%)

Render Events: ${renderMetrics.events.length}
  Avg: ${renderMetrics.avgDuration.toFixed(2)}ms
  Max: ${renderMetrics.maxDuration.toFixed(2)}ms
  Long Tasks: ${renderMetrics.longTaskCount} (${renderMetrics.longTaskPercentage.toFixed(1)}%)
    `;
  }
}

// 單例實例，全應用共享
export const performanceMonitor = new PerformanceMonitor();
