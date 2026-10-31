import type { Classification, Priority } from "./types";
import { PRIORITIES } from "./types";
export function summarizeEvaluation(rows: { expectedService: string; expectedPriority: Priority; result: Classification }[]) {
  const genuine = rows.filter(row => row.result.source === "Jev" && row.result.rawPriority && PRIORITIES.includes(row.result.rawPriority));
  const serviceCorrect = genuine.filter(row => row.expectedService === row.result.serviceType).length;
  const priorityCorrect = genuine.filter(row => row.expectedPriority === row.result.rawPriority).length;
  const underestimated = genuine.filter(row => PRIORITIES.indexOf(row.result.rawPriority!) > PRIORITIES.indexOf(row.expectedPriority)).length;
  const percent = (value: number) => genuine.length ? value / genuine.length * 100 : null;
  return { total: rows.length, genuineJev: genuine.length, excludedFallbacks: rows.length - genuine.length, serviceCorrect, priorityCorrect, servicePercent: percent(serviceCorrect), priorityPercent: percent(priorityCorrect), underestimated, underestimatedPercent: percent(underestimated), accepted: rows.length === 30 && genuine.length === 30 && serviceCorrect >= 24 && priorityCorrect >= 24 };
}
