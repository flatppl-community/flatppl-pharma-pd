# flatppl-pharma-pd

[Function reference](docs/reference.md) · [Live example](https://live.flatppl.org/#model=https%3A%2F%2Fraw.githubusercontent.com%2Fflatppl-community%2Fflatppl-pharma-pd%2Fmain%2Fexamples%2Fplayground.flatppl&target=Pi_post)

Concentration-response curves and delayed pharmacodynamic responses for FlatPPL. Library version **0.1**.

```flatppl
flatppl_compat = "0.1"
pd = load_module("main.flatppl")
p = record(baseline = 2.0, emax = 3.0, ec50 = 1.0, hill = 1.5)
response = pd.sigmoid_emax([0.0, 0.25, 1.0, 4.0], p)
```

The Hill curve is $E(C)=E_0+E_{\max}C^h/(K^h+C^h)$. Scalar or vector concentrations give responses of the same shape; parameters are scalar. Concentrations are nonnegative, and $K,h>0$. Delayed responses use a one-component ODE state with an explicit concentration callback and time grid.

The [concentration-response example](examples/playground.flatppl) infers a maximum increment and half-effect concentration. The [effect-site example](examples/effect-site.flatppl) couples oral pharmacokinetics to a delayed response.
