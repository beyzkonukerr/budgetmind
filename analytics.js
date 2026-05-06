const ss = require("simple-statistics");
const { MultivariateLinearRegression } = require("ml-regression");

const NUMERIC_FIELDS = [
  "income",
  "expense",
  "tracking",
  "budget_plan",
  "saving",
  "s11",
  "s12",
  "s13",
  "s14",
  "stress_raw",
  "stress_norm",
  "behavior_score",
  "budget_gap",
  "budget_pressure",
  "fsi"
];

function getPaired(rows, keyA, keyB) {
  const xs = [];
  const ys = [];
  for (const r of rows) {
    const a = r[keyA];
    const b = r[keyB];
    if (Number.isFinite(a) && Number.isFinite(b)) {
      xs.push(a);
      ys.push(b);
    }
  }
  return { xs, ys, n: xs.length };
}

function descriptiveStats(rows) {
  const out = {};
  for (const f of NUMERIC_FIELDS) {
    const vals = rows.map((r) => r[f]).filter((v) => Number.isFinite(v));
    if (vals.length === 0) {
      out[f] = { n: 0 };
      continue;
    }
    out[f] = {
      n: vals.length,
      mean: ss.mean(vals),
      median: ss.median(vals),
      std: vals.length > 1 ? ss.standardDeviation(vals) : 0,
      min: ss.min(vals),
      max: ss.max(vals)
    };
  }
  return out;
}

function correlationMatrix(rows) {
  const labels = NUMERIC_FIELDS;
  const matrix = [];
  for (let i = 0; i < labels.length; i++) {
    const row = [];
    for (let j = 0; j < labels.length; j++) {
      const { xs, ys, n } = getPaired(rows, labels[i], labels[j]);
      if (n < 3) {
        row.push(null);
      } else {
        row.push(ss.sampleCorrelation(xs, ys));
      }
    }
    matrix.push(row);
  }
  return { labels, matrix };
}

function simpleLinearRegression(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const pairs = xs.map((x, i) => [x, ys[i]]);
  const lr = ss.linearRegression(pairs);
  const r = ss.sampleCorrelation(xs, ys);
  return {
    n,
    slope: lr.m,
    intercept: lr.b,
    pearsonR: r,
    rSquared: r * r
  };
}

function multipleRegressionFsi(rows) {
  const X = [];
  const Y = [];
  for (const r of rows) {
    if (
      ![
        r.stress_norm,
        r.budget_pressure,
        r.behavior_score,
        r.fsi
      ].every(Number.isFinite)
    ) {
      continue;
    }
    const behaviorRisk = 1 - r.behavior_score;
    X.push([r.stress_norm, r.budget_pressure, behaviorRisk]);
    Y.push([r.fsi]);
  }
  const n = X.length;
  if (n < 5) {
    return {
      ok: false,
      message: "Coklu regresyon icin en az 5 gecerli gozlem gerekir.",
      n
    };
  }

  const mlr = new MultivariateLinearRegression(X, Y);
  const yFlat = Y.map((y) => y[0]);
  const yMean = ss.mean(yFlat);
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const yhat = mlr.predict(X[i])[0];
    const yi = yFlat[i];
    sse += (yi - yhat) ** 2;
    sst += (yi - yMean) ** 2;
  }
  const rSquared = sst > 0 ? 1 - sse / sst : null;
  const rmse = Math.sqrt(sse / n);

  const w = mlr.weights;
  const intercept = w[3] ? w[3][0] : 0;
  return {
    ok: true,
    n,
    dependent: "fsi",
    predictors: ["stress_norm", "budget_pressure", "behavior_risk"],
    coefficients: {
      stress_norm: w[0][0],
      budget_pressure: w[1][0],
      behavior_risk: w[2][0],
      intercept
    },
    rSquared,
    rmse,
    note:
      "En kucuk kareler (OLS) ile FSI ~ stress_norm + budget_pressure + behavior_risk modeli."
  };
}

function simpleRegressionsOnFsi(rows) {
  const out = {};
  const predictors = [
    "stress_norm",
    "budget_pressure",
    "stress_raw",
    "behavior_score",
    "income",
    "expense"
  ];
  for (const p of predictors) {
    const { xs, ys } = getPaired(rows, p, "fsi");
    out[p] = simpleLinearRegression(xs, ys);
  }
  return out;
}

function fsiByRiskLevel(rows) {
  const buckets = {
    "Dusuk Risk": [],
    "Orta Risk": [],
    "Yuksek Risk": []
  };
  for (const r of rows) {
    if (buckets[r.risk_level] && Number.isFinite(r.fsi)) {
      buckets[r.risk_level].push(r.fsi);
    }
  }
  return Object.entries(buckets).map(([risk_level, vals]) => ({
    risk_level,
    n: vals.length,
    mean_fsi: vals.length ? ss.mean(vals) : null,
    std_fsi: vals.length > 1 ? ss.standardDeviation(vals) : vals.length === 1 ? 0 : null
  }));
}

module.exports = {
  NUMERIC_FIELDS,
  descriptiveStats,
  correlationMatrix,
  multipleRegressionFsi,
  simpleRegressionsOnFsi,
  fsiByRiskLevel
};
