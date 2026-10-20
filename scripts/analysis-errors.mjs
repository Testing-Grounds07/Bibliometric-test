export function analysisErrorMessage(problem, fallback = 'The analysis worker stopped without an error message. Reload and retry, or choose a smaller source scope.') {
 const candidates = typeof problem === 'string' ? [problem] : [problem?.message, problem?.error?.message, problem?.error, problem?.reason];
 for (const candidate of candidates) {
  if (typeof candidate !== 'string') continue;
  const message = candidate.trim();
  if (message && !['undefined', 'null', '[object Object]'].includes(message)) return message;
 }
 return fallback;
}

export function analysisError(problem) {
 const message = analysisErrorMessage(problem);
 return problem instanceof Error && problem.message === message ? problem : new Error(message);
}
