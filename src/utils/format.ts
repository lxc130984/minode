import { Decimal } from '@/engine/num'

/** 增量游戏数字格式（docs/06 §3）：<1000 直接显示，≥1000 科学计数 1.23e6。 */
export function fmt(value: Decimal | number): string {
  const decimal = new Decimal(value)
  const abs = decimal.abs()
  if (abs.lt(1000)) {
    if (decimal.eq(decimal.floor())) return decimal.toFixed(0)
    return abs.lt(10) ? decimal.toFixed(2) : decimal.floor().toFixed(0)
  }
  const exponent = new Decimal(Math.floor(abs.log10()))
  const mantissa = decimal.div(Decimal.pow(10, exponent))
  return `${mantissa.toNumber().toFixed(2)}e${exponent.toNumber()}`
}
