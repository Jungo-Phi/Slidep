// Flags comments that break the project's comment rules, and reflows the one violation that is purely mechanical.
//
// Usage:
//   node comment-lint.mjs <file>...     report violations, exit 1 if any
//   node comment-lint.mjs --fix <file>  rewrite one sentence per line
//   node comment-lint.mjs --hook        read a Claude Code PostToolUse payload on stdin
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RULES_DOC = ".claude/comment-rules.md";
const SELF = ".claude/hooks/comment-lint.mjs";
const MAX_REPORTED = 10;

/* ----------------------------------------------------------------- shapes */

// A comment line's fixed part (indent + marker) and its prose. Anything else is code.
function shapeOf(line) {
  let m = line.match(/^(\s*)\/\/(\/?)( ?)(.*)$/);
  if (m) return { kind: "//", indent: m[1], prefix: `//${m[2]}`, text: m[4] };
  m = line.match(/^(\s*)\*(?!\/)( ?)(.*)$/);
  if (m) return { kind: "*", indent: m[1], prefix: "*", text: m[3] };
  return null;
}

const BULLET = /^\s*([-*•·▸+]\s|\d+[.)]\s|\(\d+\))/;
const ART = /[│├└─┌┐┘►→←↑↓]{2,}|\S\s{3,}\S/;
const CODEISH = /[{}]\s*$|^\s*(import|export|const|let|var|function|class|return|if|for|while)\b.*[({]/;
const DIRECTIVE = /^\s*(@|eslint-|ts-|prettier-|v8 ignore|c8 ignore|https?:\/\/)/;
const SEPARATOR = /^[-=*_#~]{3,}\s*$/;

// Lines whose own shape carries meaning: reflowing them would destroy a directive, a table or a diagram.
function rigid(text) {
  return !text.trim() || SEPARATOR.test(text) || DIRECTIVE.test(text) || ART.test(text) || CODEISH.test(text);
}

// Sentence end. Two word characters before the dot keep `p. ex.` and `e.g. Foo` whole; the capital after it keeps `.ts:275` and `1.14 %` whole.
const SENTENCE_BREAK = /(?<=[a-zà-öø-ÿ]{2}|[0-9)\]»"'`])([.!?])\s+(?=[A-ZÀ-ÖØ-Þ`«"'(])/gu;

// What a comment line must end on to be a line of its own rather than half a sentence.
const SENTENCE_TAIL = /[.!?]["'`»)\]]?\s*$/;

function reflow(paragraph) {
  const joined = paragraph.map((t) => t.trim()).join(" ").replace(/\s+/g, " ");
  return joined
    .split(SENTENCE_BREAK)
    .reduce((lines, part, i) => {
      // split() interleaves the captured punctuation, so odd entries close the line before them.
      if (i % 2) lines[lines.length - 1] += part;
      else lines.push(part.trim());
      return lines;
    }, [])
    .filter(Boolean);
}

// Walks the file once, handing each comment paragraph to `visit` and rebuilding the file from what it returns.
function eachParagraph(lines, visit) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const head = shapeOf(lines[i]);
    if (!head || rigid(head.text)) {
      out.push(lines[i]);
      continue;
    }
    const start = i;
    const paragraph = [head.text];
    while (i + 1 < lines.length) {
      const next = shapeOf(lines[i + 1]);
      if (!next || next.kind !== head.kind || next.indent !== head.indent || next.prefix !== head.prefix) break;
      if (rigid(next.text) || BULLET.test(next.text)) break;
      paragraph.push(next.text);
      i++;
    }
    for (const text of visit(paragraph, start + 1)) out.push(`${head.indent}${head.prefix} ${text}`);
  }
  return out;
}

/* ----------------------------------------------------------------- checks */

const FRENCH_LETTERS = /[éèêëàâäçùûüôöîïœÉÈÊÀÂÇÙÔÎŒ]/;
const FRENCH_WORDS = /\b(le|la|les|des|du|aux|une|est|sont|fait|pas|ne|que|qui|dans|pour|avec|sans|donc|mais|tout|toute|cette|ces|leur|leurs|nous|vous|elle|lorsque|quand|puis|alors|ainsi|chaque|encore|aussi|peut|doit|faut|ici|entre|sous|vers|depuis)\b/gi;
const HISTORY = /\b(avant|auparavant|désormais|dorénavant|remplace|ancien|ancienne|autrefois|historiquement|previously|used to|no longer|now that|instead of the old|legacy|historically|renamed from|moved from|we changed|refactor)\b/i;

// Quoted spans are dropped first: an English comment naming `Déconnexion courroie` is still English. Two signals are then needed, because a lone French function word is often an English one too.
function frenchScore(text) {
  const prose = text.replace(/`[^`]*`|"[^"]*"|«[^»]*»/g, " ");
  if (FRENCH_LETTERS.test(prose)) return 2;
  return new Set((prose.match(FRENCH_WORDS) || []).map((w) => w.toLowerCase())).size;
}

// Trailing `//` comments are checked too, but only full-line ones can be reflowed.
function proseOf(line) {
  const shape = shapeOf(line);
  if (shape) return shape.text;
  const trailing = line.match(/\S\s+\/\/ ?(.*)$/);
  return trailing ? trailing[1] : null;
}

function lint(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const findings = [];

  // Only a sentence spilling onto the next line is a violation: two short sentences sharing one line are fine, and so is a line break between them.
  eachParagraph(lines, (paragraph, lineNo) => {
    paragraph.slice(0, -1).forEach((text, k) => {
      if (!SENTENCE_TAIL.test(text)) findings.push({ line: lineNo + k, kind: "coupure", fixable: true, message: "une phrase tient sur une ligne, c'est l'éditeur qui l'enroule" });
    });
    return paragraph;
  });

  lines.forEach((line, i) => {
    const text = proseOf(line);
    if (!text || !text.trim() || DIRECTIVE.test(text)) return;
    if (frenchScore(text) >= 2) findings.push({ line: i + 1, kind: "français", message: "tout commentaire est en anglais, les anciens compris" });
    if (HISTORY.test(text)) findings.push({ line: i + 1, kind: "historique", message: "le passé appartient à git, pas au commentaire" });
  });

  return findings.sort((a, b) => a.line - b.line);
}

function fix(file) {
  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const result = eachParagraph(raw.split(/\r?\n/), (paragraph) => reflow(paragraph)).join(eol);
  if (result === raw) return false;
  fs.writeFileSync(file, result, "utf8");
  return true;
}

/* -------------------------------------------------------------------- cli */

const LINTABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// Lines this file has uncommitted, so what the agent just wrote can be told apart from the rest of the file.
function changedLines(file) {
  try {
    const diff = execFileSync("git", ["diff", "-U0", "HEAD", "--", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const touched = new Set();
    for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      for (let i = 0; i < count; i++) touched.add(start + i);
    }
    return touched;
  } catch {
    return null;
  }
}

function hook() {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  const file = payload.tool_input?.file_path;
  if (!file || !LINTABLE.test(file) || !fs.existsSync(file)) process.exit(0);

  const findings = lint(file);
  if (!findings.length) process.exit(0);

  const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
  const touched = changedLines(file);
  const mine = touched ? findings.filter((v) => touched.has(v.line)) : findings;
  const rest = touched ? findings.filter((v) => !touched.has(v.line)) : [];
  const show = (list) =>
    list.slice(0, MAX_REPORTED).map((v) => `  ${rel}:${v.line}  ${v.kind} — ${v.message}`).join("\n") +
    (list.length > MAX_REPORTED ? `\n  … et ${list.length - MAX_REPORTED} autres` : "");

  const out = [`Commentaires non conformes dans ${rel}. Les règles sont dans ${RULES_DOC} : lis-les avant de corriger.`];
  if (mine.length) out.push(`À corriger maintenant, lignes que tu viens d'écrire :\n${show(mine)}`);
  if (rest.length) out.push(`À traiter dans la foulée, tu modifies ce fichier donc tu le laisses conforme :\n${show(rest)}`);
  if (findings.some((v) => v.fixable)) out.push(`Les coupures de phrase se corrigent d'un coup : node ${SELF} --fix ${rel}`);

  console.error(out.join("\n\n"));
  process.exit(2);
}

const args = process.argv.slice(2);
if (args[0] === "--hook") {
  hook();
} else {
  const files = args.filter((a) => !a.startsWith("--") && LINTABLE.test(a));
  if (args.includes("--fix")) {
    console.log(`${files.filter(fix).length} fichiers remis en forme`);
  } else {
    const findings = files.flatMap((f) => lint(f).map((v) => ({ ...v, file: f })));
    for (const v of findings) console.log(`${v.file}:${v.line}  ${v.kind} — ${v.message}`);
    process.exit(findings.length ? 1 : 0);
  }
}
