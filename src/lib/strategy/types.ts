export type IndicatorKind = "SMA" | "EMA" | "RSI";
export type PriceField = "OPEN" | "HIGH" | "LOW" | "CLOSE" | "VOLUME";
export type ComparisonOperator = "GT" | "LT" | "GTE" | "LTE" | "EQ" | "CROSSES_ABOVE" | "CROSSES_BELOW";

export type Operand =
  | { kind: "indicator"; type: IndicatorKind; period: number }
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
