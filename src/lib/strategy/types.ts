export type IndicatorKind =
  | "SMA"
  | "EMA"
  | "WMA"
  | "HMA"
  | "RSI"
  | "MACD_LINE"
  | "MACD_SIGNAL"
  | "MACD_HISTOGRAM"
  | "BB_UPPER"
  | "BB_MIDDLE"
  | "BB_LOWER"
  | "VWAP"
  | "ATR"
  | "ADX"
  | "PLUS_DI"
  | "MINUS_DI"
  | "STOCH_K"
  | "STOCH_D"
  | "CCI"
  | "ROC"
  | "OBV"
  | "DONCHIAN_UPPER"
  | "DONCHIAN_LOWER"
  | "PIVOT_PP"
  | "PIVOT_R1"
  | "PIVOT_R2"
  | "PIVOT_R3"
  | "PIVOT_S1"
  | "PIVOT_S2"
  | "PIVOT_S3"
  | "PSAR"
  | "SUPERTREND"
  | "WILLIAMS_R"
  | "MFI"
  | "AWESOME_OSCILLATOR"
  | "AROON_UP"
  | "AROON_DOWN"
  | "CMF"
  | "KELTNER_UPPER"
  | "KELTNER_MIDDLE"
  | "KELTNER_LOWER"
  | "ENVELOPE_UPPER"
  | "ENVELOPE_LOWER"
  | "STDDEV";

export type PriceField = "OPEN" | "HIGH" | "LOW" | "CLOSE" | "VOLUME";
export type ComparisonOperator = "GT" | "LT" | "GTE" | "LTE" | "EQ" | "CROSSES_ABOVE" | "CROSSES_BELOW";

export type Operand =
  | { kind: "indicator"; type: IndicatorKind; params: number[] }
  | { kind: "price"; field: PriceField }
  | { kind: "constant"; value: number };

export type ConditionNode =
  | { kind: "group"; op: "AND" | "OR"; children: ConditionNode[] }
  | { kind: "not"; child: ConditionNode }
  | { kind: "comparison"; left: Operand; operator: ComparisonOperator; right: Operand };

export interface Signal {
  time: number;
  type: "entry" | "exit";
}
