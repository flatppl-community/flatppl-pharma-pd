# flatppl-pharma-pd

[Function reference](docs/reference.md)

Concentration-response curves and delayed pharmacodynamic responses in FlatPPL.
Library version **0.1**.

```flatppl
flatppl_compat = "0.1"
pd = load_module("main.flatppl")
p = record(baseline = 2.0, emax = 3.0, ec50 = 1.0, hill = 1.5)
response = pd.sigmoid_emax([0.0, 0.25, 1.0, 4.0], p)
```

The [concentration-response example](examples/playground.flatppl) infers a
maximum increment and half-effect concentration with proper priors. The
[effect-site example](examples/effect-site.flatppl) connects oral
[pharmacokinetics](https://github.com/flatppl-community/flatppl-pharma-pk) to a
delayed response using
[flatppl-numerics-ode](https://github.com/flatppl-community/flatppl-numerics-ode).

The library includes Emax and Hill curves, fractional inhibitory responses,
an effect compartment, and four production/loss turnover models. Parameters,
concentration callbacks, initial conditions, priors and solver grids are explicit.
See the [reference](docs/reference.md) for signs, units, domains and solver limits.

Run mathematical checks with Node 24 or newer and local JS, ODE and PK checkouts:

```sh
FLATPPL_JS_DIR=/path/to/flatppl-js \
FLATPPL_ODE_DIR=/path/to/flatppl-numerics-ode \
FLATPPL_PK_DIR=/path/to/flatppl-pharma-pk node tests/check.cjs
```
