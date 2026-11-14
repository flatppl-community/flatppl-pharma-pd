const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
let checks = 0, worst = 0;
const array = value => Array.isArray(value) ? value : Object.values(value.data);
function evaluate(request) {
  return JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'evaluate.cjs')], {
    input: JSON.stringify(request), encoding: 'utf8', env: process.env,
  }));
}
function near(actual, expected, tolerance, label) {
  const error = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
  assert.ok(Number.isFinite(actual) && error <= tolerance, `${label}: ${actual} versus ${expected}; error ${error}`);
  worst = Math.max(worst, error);
  checks++;
}
// Direct curves are checked against powers, independently of the library's
// log/logistic Hill evaluation. These cases lock zero, half and limiting effects.
const concentrations = [0, 0.25, 1, 4, 1e100];
const models = ['emax', 'sigmoid_emax', 'inhibitory_emax', 'inhibitory_sigmoid_emax'];
const p = 'record(baseline=2.0,emax=3.0,ec50=1.0,imax=0.8,ic50=1.0,hill=1.5)';
const direct = evaluate(models.map(name => `a.${name}([${concentrations}],${p})`));
direct.forEach((values, model) => array(values).forEach((value, i) => {
  const c = concentrations[i], h = model % 2 ? 1.5 : 1;
  const fraction = c ** h / (1 + c ** h);
  near(value, model < 2 ? 2 + 3 * fraction : 2 * (1 - 0.8 * fraction), 2e-14, `${models[model]}/${c}`);
}));
const identity = evaluate([
  `a.sigmoid_emax([0.25,1.0,4.0],record(baseline=2.0,emax=3.0,ec50=1.0,hill=1.0))`,
  `a.inhibitory_sigmoid_emax([0.25,1.0,4.0],record(baseline=2.0,imax=0.8,ic50=1.0,hill=1.0))`,
  `a.inhibitory_emax([0.0,1.0,1e100],record(baseline=2.0,imax=0.0,ic50=1.0))`,
]);
array(identity[0]).forEach((v,i) => near(v,array(direct[0])[i+1],2e-14,'Hill=1 stimulation'));
array(identity[1]).forEach((v,i) => near(v,array(direct[2])[i+1],2e-14,'Hill=1 inhibition'));
array(identity[2]).forEach(v => near(v,2,2e-14,'zero inhibition capacity'));

const runtime = fs.readFileSync(path.join(__dirname, 'runtime.flatppl'), 'utf8');
const positive = [2, 3, 1.1, 1.5, 0.7, 2.4, 0.6, 1.3];
const x = positive.map(Math.log);
const zeroRuntime = fs.readFileSync(path.join(__dirname, 'runtime-zero.flatppl'), 'utf8');
const zeroOutputs = array(evaluate({
  source: zeroRuntime.replace('x = elementof(cartpow(reals, 4))', `x = [${[2,3,1.1,0.65].map(Math.log)}]`), bindings: ['outputs'],
})[0]);
zeroOutputs.forEach(value => near(value,2,2e-14,'zero concentration with Hill below one'));
const output = array(evaluate({
  source: runtime.replace('x = elementof(cartpow(reals, 8))', `x = [${x}]`), bindings: ['outputs'],
})[0]);
const [baseline,emax,half,hill,ke0,kin,kout,c] = positive;
const fraction = c ** hill / (half ** hill + c ** hill);
const inhibition = 1 - 0.8 * fraction, stimulation = 1 + 1.2 * fraction;
const initial = kin/kout, times = [0,0.1,0.2,0.3,0.4];
const controls = [
  t => c + (0.2-c)*Math.exp(-ke0*t),
  t => initial*inhibition + (initial-initial*inhibition)*Math.exp(-kout*t),
  t => initial/inhibition + (initial-initial/inhibition)*Math.exp(-kout*inhibition*t),
  t => initial*stimulation + (initial-initial*stimulation)*Math.exp(-kout*t),
  t => initial/stimulation + (initial-initial/stimulation)*Math.exp(-kout*stimulation*t),
];
controls.forEach((control,j) => times.forEach((t,i) => near(output[12+5*j+i],control(t),2e-12,`constant forcing/${j}/${t}`)));
// Zero drug preserves an explicitly supplied untreated equilibrium in all four
// indirect models, whereas an effect site relaxes to zero.
const noDrug = array(evaluate({
  source: runtime.replace('x = elementof(cartpow(reals, 8))', `x = [${x}]`)
    .replace('concentration(t, q) = q.value', 'concentration(t, q) = 0.0'), bindings: ['outputs'],
})[0]);
for (let i=17;i<37;i++) near(noDrug[i],initial,2e-14,'untreated equilibrium');
times.forEach((t,i) => near(noDrug[12+i],0.2*Math.exp(-ke0*t),2e-12,'unforced effect site'));

// A changing PK input exercises the callback at intermediate solver stages.
const dynamic = fs.readFileSync(path.join(root,'examples/effect-site.flatppl'),'utf8');
const site = array(evaluate({source: dynamic,bindings:['site_concentration']})[0]);
const clearance=1.2, volume=8, absorption=0.9, bioavailability=0.8, dose=100, k=clearance/volume;
const convolution = (rate,t) => (Math.exp(-rate*t)-Math.exp(-ke0*t))/(ke0-rate);
site.forEach((v,i) => {
  const t=i/10;
  const expected=dose*bioavailability*absorption/volume/(absorption-k)*ke0*(convolution(k,t)-convolution(absorption,t));
  near(v,expected,2e-10,`oral PK to effect site/${t}`);
});
// Posterior density means the explicit proper-prior product times the Gaussian
// observation likelihood, with Emax and EC50 in their native positive coordinates.
const example = fs.readFileSync(path.join(root,'examples/playground.flatppl'),'utf8');
const point = 'record(emax=2.0,ec50=1.0)';
const score = evaluate({source:example+`\nscore=logdensityof(Pi_post,${point})`,bindings:['score']})[0];
const normal=(value,mean,sd)=>-0.5*((value-mean)/sd)**2-Math.log(sd)-0.5*Math.log(2*Math.PI);
const data=[2.03,2.36,2.71,3.01,3.36,3.58], experiment=[0,0.25,0.5,1,2,4];
const expected=normal(Math.log(2),Math.log(2),0.4)-Math.log(2)+normal(0,0,0.5)
  +data.reduce((s,y,i)=>s+normal(y,2+2*experiment[i]/(1+experiment[i]),0.08),0);
near(score,expected,2e-12,'proper-prior posterior density');
console.log(JSON.stringify({checks,worstNormalizedError:worst}));
