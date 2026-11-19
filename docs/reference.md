# Pharmacodynamics reference

Library version **0.1** · [Package overview](../README.md)

Use consistent concentration, response and time units. Direct curves accept a
scalar or vector concentration and a record of scalar parameters. Concentration
is finite and nonnegative; half-effect concentrations and Hill exponents are
finite and positive. Domains are caller obligations; functions do not validate
or clamp inputs.

| Function | Purpose |
|---|---|
| [`emax`](#emax) | Baseline plus a saturating increment |
| [`sigmoid_emax`](#sigmoid_emax) | Emax with a positive Hill exponent |
| [`inhibitory_emax`](#inhibitory_emax) | Fractional reduction of baseline |
| [`inhibitory_sigmoid_emax`](#inhibitory_sigmoid_emax) | Fractional Hill inhibition |
| [`effect_site_rhs`](#effect_site_rhs) | First-order effect compartment |
| [`indirect_inhibition_input_rhs`](#indirect_inhibition_input_rhs) | Model I: inhibit production |
| [`indirect_inhibition_loss_rhs`](#indirect_inhibition_loss_rhs) | Model II: inhibit loss |
| [`indirect_stimulation_input_rhs`](#indirect_stimulation_input_rhs) | Model III: stimulate production |
| [`indirect_stimulation_loss_rhs`](#indirect_stimulation_loss_rhs) | Model IV: stimulate loss |
| [`effect_site`](#effect_site) | Solve effect-site concentrations |
| [`indirect_response`](#indirect_response) | Solve a turnover response |

## `emax`

`emax(concentration, p)` uses fields `baseline`, `emax`, `ec50`:

$$E(C)=E_0+E_{\max}\frac{C}{EC_{50}+C}.$$

`baseline` and `emax` have response units. `baseline` is any finite real and
`emax` is finite and nonnegative. Here `emax` means **maximum increment above
baseline**, so the asymptote is `baseline + emax`. `ec50` has concentration
units and gives half the maximum increment, regardless of baseline.
At zero concentration the response equals baseline.

## `sigmoid_emax`

`sigmoid_emax(concentration, p)` adds field `hill` to the Emax parameters:

$$F(C;K,h)=\frac{C^h}{K^h+C^h},\qquad E(C)=E_0+E_{\max}F(C;EC_{50},h).$$

The dimensionless `hill` is strictly positive. `hill = 1` recovers `emax`;
values below one are allowed. `ec50` still gives half the maximum increment.
The zero and infinite-concentration limits remain baseline and baseline plus
maximum increment.

For positive concentration, the Hill fraction is evaluated as
$`\{1+\exp[-h(\log C-\log K)]\}^{-1}`$ to avoid large powers. Zero is handled
explicitly with a protected logarithm, retaining finite parameter derivatives.
The concentration-derivative contract is for $C>0$: at zero its right-hand
limit is infinite for $0<h<1$, $1/K$ for $h=1$, and zero for $h>1$.
The explicit zero branch does not promise these boundary concentration tangents.

## `inhibitory_emax`

`inhibitory_emax(concentration, p)` uses `baseline`, `imax`, `ic50`:

$$E(C)=E_0\left(1-I_{\max}\frac{C}{IC_{50}+C}\right).$$

`baseline` is finite and nonnegative, with response units. `imax` is a
**dimensionless fraction** in $[0,1]$, rather than an absolute response decrement.
`ic50` has concentration units and gives half of the maximum fractional
inhibition; it halves the baseline response only when `imax = 1`.
The zero-concentration response is baseline and the asymptote is
`baseline * (1 - imax)`. Inhibition has an explicit minus sign.

## `inhibitory_sigmoid_emax`

`inhibitory_sigmoid_emax(concentration, p)` adds a positive `hill` to the
inhibitory parameters:

$$E(C)=E_0[1-I_{\max}F(C;IC_{50},h)].$$

The same fractional-inhibition convention and limits apply. `hill = 1` recovers
`inhibitory_emax`. Evaluation and boundary derivative conventions are those of
[`sigmoid_emax`](#sigmoid_emax).

## Dynamic inputs

Every dynamic RHS takes `(concentration, t, y, p)`. The deterministic callback
`concentration(t, p.concentration_parameters)` returns a scalar concentration at
any time requested by the solver, including intermediate stages. Pass every
fitted numeric value in `p`; the callback must not capture stochastic values.
A PK function, analytic input or an explicitly specified interpolation rule can
supply concentration. A vector of observations alone does not define that rule.

`y` is a one-element vector. For the effect site it contains concentration;
for indirect models it contains response. RHS functions return a one-element
vector with the corresponding units per time. An effect compartment represents
delayed equilibration, while indirect response represents production and loss of
the response itself. These are different mechanisms.

## `effect_site_rhs`

`effect_site_rhs(concentration, t, y, p)` requires fields `ke0` and
`concentration_parameters`:

$$\dot C_e=k_{e0}[C(t)-C_e].$$

`ke0` is finite and positive, with units $1/\mathrm{time}$. $C_e$ uses the same
concentration units as $C$. The compartment has no mass balance feedback to PK.
Use $C_e$ as the concentration input to a direct response curve.
At constant $`C_*`$, $`C_e(t)=C_*+[C_e(t_0)-C_*]e^{-k_{e0}(t-t_0)}`$.

## Indirect response parameters

All four indirect RHS functions require `kin`, `kout`, `hill` and
`concentration_parameters`. `kin` is finite and positive, with units
response/time. `kout` is finite and positive, with units $1/\mathrm{time}$.
The untreated stationary baseline is $R_0=k_{in}/k_{out}$. The caller supplies
the initial response; equilibrium is not imposed. To parameterize by baseline,
set `kin = baseline * kout` explicitly.

Inhibitory models also require `imax` in $[0,1]$ and positive `ic50`.
Stimulatory models require finite nonnegative dimensionless `smax` and positive
`sc50`. The half-effect concentrations have concentration units. Define

$$I(C)=1-I_{\max}F(C;IC_{50},h),\qquad
S(C)=1+S_{\max}F(C;SC_{50},h).$$

These multiply a **rate**, rather than directly rescaling the measured response.
`ic50` and `sc50` give half the maximal rate modulation. Setting `hill = 1`
gives the classical hyperbolic forms. At zero drug both modifiers equal one and
all four models reduce to $\dot R=k_{in}-k_{out}R$.

## `indirect_inhibition_input_rhs`

`indirect_inhibition_input_rhs(concentration, t, y, p)` implements Model I:

$$\dot R=k_{in}I(C)-k_{out}R.$$

Inhibiting production lowers response. Constant concentration has equilibrium
$R_*=R_0 I(C)$ and relaxation rate $k_{out}$.

## `indirect_inhibition_loss_rhs`

`indirect_inhibition_loss_rhs(concentration, t, y, p)` implements Model II:

$$\dot R=k_{in}-k_{out}I(C)R.$$

Inhibiting loss raises response. For constant concentration and $I(C)>0$,
$R_*=R_0/I(C)$ and the relaxation rate is $k_{out}I(C)$. Complete loss inhibition
$I=0$ gives linear growth $\dot R=k_{in}$, rather than a finite equilibrium.

## `indirect_stimulation_input_rhs`

`indirect_stimulation_input_rhs(concentration, t, y, p)` implements Model III:

$$\dot R=k_{in}S(C)-k_{out}R.$$

Stimulating production raises response. Constant concentration has equilibrium
$R_*=R_0 S(C)$ and relaxation rate $k_{out}$.

## `indirect_stimulation_loss_rhs`

`indirect_stimulation_loss_rhs(concentration, t, y, p)` implements Model IV:

$$\dot R=k_{in}-k_{out}S(C)R.$$

Stimulating loss lowers response. Constant concentration has equilibrium
$R_*=R_0/S(C)$ and relaxation rate $k_{out}S(C)$.

## `effect_site`

`effect_site(solver, concentration, initial, times, p)` solves the effect-site
RHS and returns a vector of concentrations, including `initial` at `times[1]`.
`initial` is a finite nonnegative concentration. `times` is a finite strictly
increasing vector of at least two entries.

## `indirect_response`

`indirect_response(solver, rhs, concentration, initial, times, p)` solves one of
the four indirect RHS functions from the table. It returns a vector of
responses including `initial`, a finite nonnegative response, at `times[1]`.
The same time-grid requirements apply.

Both solve helpers accept an existing solver with signature
`solver(f, initial_vector, times, p)`, for example `ode.vern7` from
[flatppl-numerics-ode](https://github.com/flatppl-community/flatppl-numerics-ode).
They pass callbacks and parameters explicitly to that solver. The library does
not implement an integrator, dose events, adaptive steps or priors. Split solves
at discontinuities and carry the final state into the next interval; align the
forcing on each interval explicitly. Refine smooth grids to check accuracy.
The solver may evaluate intermediate states outside the physical domain;
no positivity correction or gradient clamping is applied. See the
[ODE reference](https://github.com/flatppl-community/flatppl-numerics-ode/blob/main/docs/reference.md)
for solver-specific limitations.

## Sources

[Holford (2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7033401/) motivates the
Emax concentration-response relationship. The sigmoid formula and four indirect
mechanisms follow the original equations (1)–(8), (11)–(13) of
[Dayneka, Garg and Jusko (1993)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4207304/).
The fractional direct-inhibition convention here is $E_{\max}=E_0 I_{\max}$ in
their decrement form. Partial inhibition, rate-stimulation capacity and Hill
exponents are explicit generalizations of their basic turnover models.

## Examples and validation

The [live concentration-response example](https://live.flatppl.org/#model=https%3A%2F%2Fraw.githubusercontent.com%2Fflatppl-community%2Fflatppl-pharma-pd%2Fmain%2Fexamples%2Fplayground.flatppl&target=Pi_post) infers a
maximum increment and half-effect concentration with proper priors. The
[effect-site example](../examples/effect-site.flatppl) connects oral
[pharmacokinetics](https://github.com/flatppl-community/flatppl-pharma-pk) to a
delayed response using
[flatppl-numerics-ode](https://github.com/flatppl-community/flatppl-numerics-ode).

The library includes Emax and Hill curves, fractional inhibitory responses,
an effect compartment, and four production/loss turnover models. Parameters,
concentration callbacks, initial conditions, priors and solver grids are explicit.

Run mathematical checks with Node 24 or newer and local JS, ODE and PK checkouts:

```sh
FLATPPL_JS_DIR=/path/to/flatppl-js \
FLATPPL_ODE_DIR=/path/to/flatppl-numerics-ode \
FLATPPL_PK_DIR=/path/to/flatppl-pharma-pk node tests/check.cjs
```
