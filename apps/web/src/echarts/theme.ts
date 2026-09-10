import type * as echarts from 'echarts'

/** 暗色主题共享色板（与 style.css 变量一致）。 */
export const CHART = {
  text: '#7d93b2',
  accent: '#2f7bff',
  ok: '#22c55e',
  warn: '#faad14',
  crit: '#ff4d4f',
  purple: '#8b5cf6',
  grid: 'rgba(90,130,200,0.15)',
}

export const STATUS_COLOR: Record<string, string> = {
  normal: CHART.ok,
  warn: CHART.warn,
  alert: CHART.crit,
}

export const LEVEL_COLOR: Record<string, string> = {
  info: CHART.accent,
  warn: CHART.warn,
  crit: CHART.crit,
}

export function baseOption(): echarts.EChartsCoreOption {
  return {
    backgroundColor: 'transparent',
    textStyle: { color: CHART.text, fontSize: 11 },
    grid: { left: 38, right: 12, top: 24, bottom: 22 },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,27,48,0.94)',
      borderColor: 'rgba(90,130,200,0.4)',
      textStyle: { color: '#d7e3f4', fontSize: 12 },
    },
  }
}

export const axisStyle = {
  axisLabel: { color: CHART.text, fontSize: 10 },
  axisLine: { lineStyle: { color: 'rgba(90,130,200,0.3)' } },
  splitLine: { lineStyle: { color: CHART.grid } },
}
