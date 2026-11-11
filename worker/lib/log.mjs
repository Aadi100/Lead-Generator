export function log(area, ...args) {
  console.log(new Date().toISOString().slice(11, 19), `[${area}]`, ...args);
}
