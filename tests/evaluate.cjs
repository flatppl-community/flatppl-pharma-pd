// Evaluate library calls through the JS engine's normal module loader.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const enginePath = path.resolve(process.env.FLATPPL_JS_DIR || path.join(root, '../flatppl-js'), 'packages/engine');
const engine = require(path.join(enginePath, 'index.ts'));
const { createWorkerHandler } = require(path.join(enginePath, 'worker.ts'));

(async () => {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const expressions = Array.isArray(request) ? request : null;
  const modulePaths = ['main.flatppl', ...['src', 'examples'].flatMap(dir =>
    fs.readdirSync(path.join(root, dir), { recursive: true })
      .filter(name => name.endsWith('.flatppl')).map(name => dir + '/' + name))];
  const sources = Object.fromEntries(modulePaths
    .map(name => [path.join(root, name), fs.readFileSync(path.join(root, name), 'utf8')]));
  // Exercise a pinned example offline against this checkout's library sources.
  const example = sources[path.join(root, 'examples/playground.flatppl')];
  const pinnedBase = example.match(/https:\/\/raw\.githubusercontent\.com\/flatppl-community\/flatppl-pharma-pd\/[0-9a-f]{40}\//)?.[0];
  if (pinnedBase) for (const name of modulePaths) sources[pinnedBase + name] = sources[path.join(root, name)];
  for (const [name, revision, variable] of [
    ['flatppl-numerics-ode', '728507a8b8f62914a5c184ff7d3d47560b3f902a', 'FLATPPL_ODE_DIR'],
    ['flatppl-pharma-pk', 'd92741153dabadf302237ed4d115ca1ba6520ea4', 'FLATPPL_PK_DIR'],
  ]) {
    const directory = process.env[variable] || [path.join(root, '..', name), path.join(root, '../..', name)]
      .find(candidate => fs.existsSync(path.join(candidate, 'main.flatppl')));
    if (!directory) throw new Error(`Set ${variable} to the ${name} checkout`);
    const files = ['main.flatppl', ...fs.readdirSync(path.join(directory, 'src'), {recursive: true})
      .filter(file => file.endsWith('.flatppl')).map(file => 'src/' + file)];
    for (const file of files) sources[`https://raw.githubusercontent.com/flatppl-community/${name}/${revision}/${file}`]
      = fs.readFileSync(path.join(directory, file), 'utf8');
  }
  const source = expressions ? 'flatppl_compat = "0.1"\na = load_module("../main.flatppl")\n'
    + expressions.map((expression, i) => `probe${i} = ${expression}`).join('\n') : request.source;
  const model = engine.processSource(source, {
    path: path.join(__dirname, 'query.flatppl'), bundle: { sources },
  });
  const errors = model.diagnostics.filter(d => d.severity === 'error');
  if (errors.length) throw new Error(JSON.stringify(errors));
  const result = engine.orchestrator.buildDerivations(model.linkedBindings, {
    moduleRegistry: model.linkedModuleRegistry,
  });
  const names = expressions ? expressions.map((_, i) => `probe${i}`) : request.bindings;
  const worker = createWorkerHandler();
  const seed = 47710;
  worker.handle({ type: 'init', seed });
  const ctx = {
    ...result, sampleCount: request.sampleCount || 1, rootKey: seed, rootSeed: seed,
    marginalizationCount: 64,
    sendWorker: async message => {
      const reply = await worker.handle(message);
      if (reply?.type === 'error') throw new Error(JSON.stringify(reply));
      return reply;
    },
    getMeasure: name => engine.materialiser.materialiseMeasure(name, ctx),
  };
  const values = await Promise.all(names.map(async name => {
    if (result.fixedValues.has(name)) return result.fixedValues.get(name);
    const measure = await ctx.getMeasure(name);
    return request.sampleCount ? measure : measure.samples[0];
  }));
  process.stdout.write(JSON.stringify(values, (_key, value) =>
    typeof value === 'number' && !Number.isFinite(value) ? String(value) : value));
})().catch(error => { console.error(error); process.exitCode = 1; });
