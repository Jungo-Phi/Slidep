// Creates a worktree next to the main checkout, ready to work in: local files copied, dependencies installed, VS Code opened.
//
// Usage: `npm run worktree -- <branch> [base]`.
// The worktree lands in ../slidep-<branch>.
// An existing branch (local or on origin) is checked out as is; otherwise <branch> is created from [base], which defaults to main.
// Remove it once merged with `git worktree remove ../slidep-<branch>`.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

// Git-ignored, so a fresh checkout lacks them: without them Claude has no working instructions or permissions there.
const LOCAL_FILES = ["CLAUDE.local.md", ".claude/settings.local.json", ".vscode"];

const DEFAULT_BASE = "main";

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function refExists(ref) {
  return spawnSync("git", ["show-ref", "--verify", "--quiet", ref]).status === 0;
}

// `npm` and `code` are .cmd shims on Windows, which only a shell can launch.
function shell(command, cwd) {
  return spawnSync(command, { cwd, stdio: "inherit", shell: true }).status === 0;
}

const [branch, base = DEFAULT_BASE] = process.argv.slice(2);
if (!branch) fail("Usage: npm run worktree -- <branch> [base]");
if (spawnSync("git", ["check-ref-format", "--branch", branch]).status !== 0) fail(`"${branch}" is not a valid branch name.`);

// Resolved from the shared .git so that the script also works when run from another worktree.
const mainRoot = path.dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir"));
const target = path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}-${branch.replaceAll("/", "-")}`);
if (fs.existsSync(target)) fail(`${target} already exists.`);

const branchExists = refExists(`refs/heads/${branch}`) || refExists(`refs/remotes/origin/${branch}`);
const addArgs = branchExists ? ["worktree", "add", target, branch] : ["worktree", "add", "-b", branch, target, base];
console.log(`→ git ${addArgs.join(" ")}`);
try {
  execFileSync("git", addArgs, { stdio: "inherit" });
} catch {
  fail("git worktree add failed, nothing was created.");
}

for (const name of LOCAL_FILES) {
  const source = path.join(mainRoot, name);
  if (!fs.existsSync(source)) continue;
  const destination = path.join(target, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  console.log(`→ copied ${name}`);
}

console.log("→ npm ci");
if (!shell("npm ci", target)) fail(`npm ci failed. The worktree exists in ${target}: rerun npm ci there.`);

if (!shell(`code "${target}"`)) console.log(`\nVS Code could not be opened, open ${target} manually.`);
console.log(`\n✔ Worktree ready in ${target} on branch ${branch}.`);
