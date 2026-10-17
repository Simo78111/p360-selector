// Walks every path through the job finder and checks each one ends in an outcome.
import { outcomes, questions, resolve, ROOT } from "../src/lib/finder";

const problems: string[] = [];
const used = new Set<string>();
let paths = 0;

function walk(qid: string, answers: string[]) {
  const q = questions[qid];
  if (!q) return problems.push(`Missing question "${qid}" after ${answers.join(".")}`);
  for (const o of q.options) {
    const next = [...answers, o.id];
    if (o.next) walk(o.next, next);
    else {
      paths++;
      const r = resolve(next);
      if (!r.outcome) problems.push(`No outcome for ${next.join(".")}`);
      else used.add(r.outcome.id);
    }
  }
}

walk(ROOT, []);
for (const id of Object.keys(outcomes)) if (!used.has(id)) problems.push(`Outcome "${id}" is never reached`);
console.log(`${paths} paths, ${used.size}/${Object.keys(outcomes).length} outcomes reached`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
