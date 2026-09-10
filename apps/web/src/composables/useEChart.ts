import * as echarts from 'echarts'
import { onBeforeUnmount, onMounted, useTemplateRef, watch, type WatchSource } from 'vue'

/**
 * 轻量图表生命周期封装：init / 数据变更重绘 / resize / dispose。
 * 用法：
 *   const el = useEChart((c) => c.setOption(...), watchSource)
 *   <template><div class="chart" ref="el"></div></template>
 * render 内用 setOption(option, true)（notMerge）保证重绘干净。
 */
export function useEChart(render: (c: echarts.ECharts) => void, source?: WatchSource<unknown>) {
  const el = useTemplateRef<HTMLElement>('chart')
  let chart: echarts.ECharts | null = null
  let onResize: (() => void) | null = null

  onMounted(() => {
    if (!el.value) return
    chart = echarts.init(el.value)
    render(chart)
    onResize = () => chart?.resize()
    window.addEventListener('resize', onResize)
  })
  if (source) {
    watch(source, () => {
      if (chart) render(chart)
    })
  }
  onBeforeUnmount(() => {
    if (onResize) window.removeEventListener('resize', onResize)
    chart?.dispose()
    chart = null
  })
  return el
}
