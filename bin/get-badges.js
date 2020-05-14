const { get } = require('https');
const { readFile, writeFile } = require('fs');

const getColour = (coverage) => {
  if (coverage < 80) {
    return 'red';
  }
  if (coverage < 90) {
    return 'yellow';
  }
  return 'brightgreen';
};

const getTestsBadge = (report) => {
  if (!(report && report.stats && report.stats.passes)) {
    throw new Error('malformed coverage report');
  }

  // TODO Show pending, failed
  return `https://img.shields.io/badge/tests-${report.stats.passes}${encodeURI(
    ' ',
  )}passing-brightgreen.svg`;
};

const getCoverageBadge = (report, type) => {
  if (!(report && report.total && report.total[type])) {
    throw new Error('malformed coverage report');
  }

  const coverage = report.total[type].pct;
  const colour = getColour(coverage);

  return `https://img.shields.io/badge/coverage:${type}-${coverage}${encodeURI(
    '%',
  )}-${colour}.svg`;
};

const download = (url, cb) => {
  get(url, (res) => {
    let file = '';
    res.on('data', (chunk) => (file += chunk));
    res.on('end', () => cb(null, file));
  }).on('error', (err) => cb(err));
};

const mochaReportPath = './coverage/mocha-summary.json';
const coverageReportPath = './coverage/coverage-summary.json';
const outputBasePath = './assets';

readFile(coverageReportPath, 'utf8', (err, res) => {
  if (err) throw err;
  const report = JSON.parse(res);
  ['statements', 'functions', 'branches', 'lines'].forEach((type) => {
    const url = getCoverageBadge(report, type);
    download(url, (err, res) => {
      if (err) throw err;
      const outputPath = `${outputBasePath}/coverage-${type}.svg`;
      writeFile(outputPath, res, 'utf8', (err) => {
        console.log(`Saved ${outputPath}`);
        if (err) throw err;
      });
    });
  });
});

readFile(mochaReportPath, 'utf8', (err, res) => {
  if (err) throw err;
  const report = JSON.parse(res);
  const url = getTestsBadge(report);
  download(url, (err, res) => {
    if (err) throw err;
    const outputPath = `${outputBasePath}/tests.svg`;
    writeFile(outputPath, res, 'utf8', (err) => {
      console.log(`Saved ${outputPath}`);
      if (err) throw err;
    });
  });
});
