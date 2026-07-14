/* Tiny ANSI logger. No deps. */

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const paint = (color: string, s: string) => `${color}${s}${C.reset}`;

export const log = {
  info: (msg: string) => console.log(msg),
  step: (msg: string) => console.log(paint(C.cyan, `› ${msg}`)),
  ok: (msg: string) => console.log(paint(C.green, `✓ ${msg}`)),
  warn: (msg: string) => console.log(paint(C.yellow, `! ${msg}`)),
  err: (msg: string) => console.log(paint(C.red, `✗ ${msg}`)),
  dim: (msg: string) => console.log(paint(C.gray, msg)),
  header: (msg: string) => console.log(`\n${paint(C.bold, msg)}`),
  raw: console.log,
};

export const c = {
  b: (s: string) => paint(C.bold, s),
  green: (s: string) => paint(C.green, s),
  yellow: (s: string) => paint(C.yellow, s),
  red: (s: string) => paint(C.red, s),
  cyan: (s: string) => paint(C.cyan, s),
  gray: (s: string) => paint(C.gray, s),
  blue: (s: string) => paint(C.blue, s),
};
