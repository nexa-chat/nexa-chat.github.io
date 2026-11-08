/**
 * A small arithmetic evaluator for the calculator tool. It parses the expression itself, never
 * with eval or Function, so a model can't make it run code.
 *
 * Grammar: expression = term (("+" | "-") term)*
 *          term       = power (("*" | "/" | "%") power)*
 *          power      = unary ("^" power)?
 *          unary      = ("-" | "+") unary | call
 *          call       = name "(" expression ("," expression)* ")" | name | number | "(" expression ")"
 */

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: (value, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export class CalculatorError extends Error {}

const MAX_LENGTH = 500;

export function calculate(expression: string): number {
  if (expression.length > MAX_LENGTH) throw new CalculatorError("The expression is too long.");
  const source = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/,(?=\d{3}\b)/g, "");
  let position = 0;

  const skip = (): void => {
    while (source[position] === " ") position += 1;
  };
  const peek = (): string | undefined => {
    skip();
    return source[position];
  };
  const expect = (char: string): void => {
    if (peek() !== char) throw new CalculatorError(`Expected "${char}" at position ${position + 1}.`);
    position += 1;
  };

  function expressionValue(): number {
    let value = term();
    for (let op = peek(); op === "+" || op === "-"; op = peek()) {
      position += 1;
      value = op === "+" ? value + term() : value - term();
    }
    return value;
  }

  function term(): number {
    let value = power();
    for (let op = peek(); op === "*" || op === "/" || op === "%"; op = peek()) {
      position += 1;
      const right = power();
      if (op === "*") value *= right;
      else if (op === "/") {
        if (right === 0) throw new CalculatorError("Division by zero.");
        value /= right;
      } else value %= right;
    }
    return value;
  }

  function power(): number {
    const base = unary();
    if (peek() === "^") {
      position += 1;
      return base ** power();
    }
    return base;
  }

  function unary(): number {
    const op = peek();
    if (op === "-" || op === "+") {
      position += 1;
      const value = unary();
      return op === "-" ? -value : value;
    }
    return call();
  }

  function call(): number {
    const char = peek();
    if (char === "(") {
      position += 1;
      const value = expressionValue();
      expect(")");
      return value;
    }
    const number = /^\d+(\.\d+)?(e[+-]?\d+)?|^\.\d+/i.exec(source.slice(position));
    if (number) {
      position += number[0].length;
      return Number(number[0]);
    }
    const name = /^[a-z]+/i.exec(source.slice(position))?.[0]?.toLowerCase();
    if (name) {
      position += name.length;
      if (name in CONSTANTS) return CONSTANTS[name] ?? 0;
      const fn = FUNCTIONS[name];
      if (!fn) throw new CalculatorError(`Unknown function "${name}".`);
      expect("(");
      const args = [expressionValue()];
      while (peek() === ",") {
        position += 1;
        args.push(expressionValue());
      }
      expect(")");
      return fn(...args);
    }
    throw new CalculatorError(char ? `Unexpected "${char}" at position ${position + 1}.` : "The expression ended early.");
  }

  const value = expressionValue();
  if (peek() !== undefined) throw new CalculatorError(`Unexpected "${peek()}" at position ${position + 1}.`);
  if (!Number.isFinite(value)) throw new CalculatorError("The result isn't a finite number.");
  return value;
}
