import Decimal from 'break_infinity.js'

export { Decimal }

/** 内容作者可写 number/string；引擎内部一律用 Decimal。 */
export type Num = number | string | Decimal

/** 全仓唯一的 Decimal 创建入口——将来换大数库只动这里。 */
export function D(value: Num): Decimal {
  return value instanceof Decimal ? value : new Decimal(value)
}
