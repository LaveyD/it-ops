import * as echarts from 'echarts'
import { onBeforeUnmount, onMounted, useTemplateRef, watch, type WatchSource } from 'vue'

/**
 * 轻量图表生命周期封装：init / 数据变更重绘 / resize / dispose。
 * 用法：
 *   const el = useEChart((c) => c.setOption(...), watchSource)
 *   <template><div class="chart" ref="el"></div></template>
 * render 内用 setOption(option, true)（notMerge）保证重绘干净。
 * 注意：支持懒初始化 —— v-show 隐藏容器（width=0）在 mounted 时无法 init，
 * 首次 render 若容器未就绪则跳过，watch 触发时容器可见再 init（如抽屉「指标」Tab）。
 */
export function useEChart(render: (c: echarts.ECharts) => void, source?: WatchSource<unknown>) {
  const el = useTemplateRef<HTMLElement>('chart')
  let chart: echarts.ECharts | null = null
  let onResize: (() => void) | null = null

  function ensure(): echarts.ECharts | null {
    if (chart) return chart
    if (!el.value || el.value.clientWidth === 0) return null
    chart = echarts.init(el.value)
    onResize = () => chart?.resize()
    window.addEventListener('resize', onResize)
    return chart
  }

  onMounted(() => {
    if (ensure()) render(chart!)
  })
  if (source) {
    watch(source, () => {
      if (ensure()) render(chart!)
    })
  }
  onBeforeUnmount(() => {
    if (onResize) window.removeEventListener('resize', onResize)
    chart?.dispose()
    chart = null
  })
  return el
}
