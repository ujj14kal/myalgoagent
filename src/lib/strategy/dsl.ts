import type { ComparisonOperator, ConditionNode, IndicatorKind, Operand, PriceField } from "./types";

export class DslSyntaxError extends Error {
  line: number;
  column: number;

  constructor(message: string, line: number, column: number) {
    super(message);
    this.name = "DslSyntaxError";
    this.line = line;
    this.column = column;
  }
}

type TokenType =
  | "IDENT"
  | "NUMBER"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "OP"
  | "EOF";

interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const INDICATOR_NAMES: Record<string, IndicatorKind> = { sma: "SMA", ema: "EMA", rsi: "RSI" };
const PRICE_NAMES: Record<string, PriceField> = {
  open: "OPEN",
  high: "HIGH",
  low: "LOW",
  close: "CLOSE",
  volume: "VOLUME",
};
const KEYWORD_COMPARATORS: Record<string, ComparisonOperator> = {
  crossesabove: "CROSSES_ABOVE",
  crossesbelow: "CROSSES_BELOW",
};
const SYMBOL_COMPARATORS: Record<string, ComparisonOperator> = {
  ">": "GT",
  "<": "LT",
  ">=": "GTE",
  "<=": "LTE",
  "==": "EQ",
};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let column = 1;
  let i = 0;

  function advance(n = 1) {
    for (let k = 0; k < n; k++) {
      if (source[i] === "\n") {
        line++;
        column = 1;
      } else {
        column++;
      }
      i++;
    }
  }

  while (i < source.length) {
    const c = source[i];

    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      advance();
      continue;
    }

    const startLine = line;
    const startColumn = column;

    if (c === "(") {
      tokens.push({ type: "LPAREN", value: "(", line: startLine, column: startColumn });
      advance();
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "RPAREN", value: ")", line: startLine, column: startColumn });
      advance();
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "COMMA", value: ",", line: startLine, column: startColumn });
      advance();
      continue;
    }

    if (c === ">" || c === "<" || c === "=") {
      let op = c;
      advance();
      if ((source[i] as string) === "=") {
        op += "=";
        advance();
      }
      tokens.push({ type: "OP", value: op, line: startLine, column: startColumn });
      continue;
    }

    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source[i])) {
        num += source[i];
        advance();
      }
      tokens.push({ type: "NUMBER", value: num, line: startLine, column: startColumn });
      continue;
    }

    if (/[a-zA-Z_]/.test(c)) {
      let ident = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) {
        ident += source[i];
        advance();
      }
      tokens.push({ type: "IDENT", value: ident, line: startLine, column: startColumn });
      continue;
    }

    throw new DslSyntaxError(`Unexpected character "${c}"`, startLine, startColumn);
  }

  tokens.push({ type: "EOF", value: "", line, column });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType, expected: string): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      throw new DslSyntaxError(`Expected ${expected}, found "${tok.value || "end of input"}"`, tok.line, tok.column);
    }
    return this.next();
  }

  parseProgram(): ConditionNode {
    const node = this.parseOr();
    const tok = this.peek();
    if (tok.type !== "EOF") {
      throw new DslSyntaxError(`Unexpected "${tok.value}"`, tok.line, tok.column);
    }
    return node;
  }

  private parseOr(): ConditionNode {
    let left = this.parseAnd();
    while (this.peek().type === "IDENT" && this.peek().value.toLowerCase() === "or") {
      this.next();
      const right = this.parseAnd();
      left = { kind: "group", op: "OR", children: [left, right] };
    }
    return left;
  }

  private parseAnd(): ConditionNode {
    let left = this.parseNot();
    while (this.peek().type === "IDENT" && this.peek().value.toLowerCase() === "and") {
      this.next();
      const right = this.parseNot();
      left = { kind: "group", op: "AND", children: [left, right] };
    }
    return left;
  }

  private parseNot(): ConditionNode {
    if (this.peek().type === "IDENT" && this.peek().value.toLowerCase() === "not") {
      this.next();
      return { kind: "not", child: this.parseNot() };
    }
    if (this.peek().type === "LPAREN") {
      this.next();
      const inner = this.parseOr();
      this.expect("RPAREN", '")"');
      return inner;
    }
    return this.parseComparison();
  }

  private parseComparison(): ConditionNode {
    const left = this.parseOperand();
    const opTok = this.peek();

    let operator: ComparisonOperator | undefined;
    if (opTok.type === "OP") {
      operator = SYMBOL_COMPARATORS[opTok.value];
      this.next();
    } else if (opTok.type === "IDENT" && KEYWORD_COMPARATORS[opTok.value.toLowerCase()]) {
      operator = KEYWORD_COMPARATORS[opTok.value.toLowerCase()];
      this.next();
    }

    if (!operator) {
      throw new DslSyntaxError(
        `Expected a comparator (>, <, >=, <=, ==, crossesAbove, crossesBelow), found "${opTok.value || "end of input"}"`,
        opTok.line,
        opTok.column,
      );
    }

    const right = this.parseOperand();
    return { kind: "comparison", left, operator, right };
  }

  private parseOperand(): Operand {
    const tok = this.peek();

    if (tok.type === "NUMBER") {
      this.next();
      return { kind: "constant", value: Number(tok.value) };
    }

    if (tok.type === "IDENT") {
      const lower = tok.value.toLowerCase();

      if (INDICATOR_NAMES[lower]) {
        this.next();
        this.expect("LPAREN", '"("');
        const periodTok = this.expect("NUMBER", "a period number");
        this.expect("RPAREN", '")"');
        return { kind: "indicator", type: INDICATOR_NAMES[lower], period: Number(periodTok.value) };
      }

      if (PRICE_NAMES[lower]) {
        this.next();
        return { kind: "price", field: PRICE_NAMES[lower] };
      }

      throw new DslSyntaxError(
        `Unknown identifier "${tok.value}" — expected sma(), ema(), rsi(), open, high, low, close, volume, or a number`,
        tok.line,
        tok.column,
      );
    }

    throw new DslSyntaxError(`Expected a value, found "${tok.value || "end of input"}"`, tok.line, tok.column);
  }
}

export function parseDsl(source: string): ConditionNode {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new DslSyntaxError("Expression is empty", 1, 1);
  }
  const tokens = tokenize(source);
  return new Parser(tokens).parseProgram();
}
