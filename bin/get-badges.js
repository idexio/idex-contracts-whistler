const { get } = require('https');
const { readFile, writeFile } = require('fs');
const { basename } = require('path');
const mri = require('mri');

const getColour = (coverage) => {
  if (coverage < 80) {
    return 'red';
  }
  if (coverage < 90) {
    return 'yellow';
  }
  return 'brightgreen';
};

const getBadge = (report, type) => {
  if (!(report && report.total && report.total[type])) {
    throw new Error('malformed coverage report');
  }

  const title = type[0].toUpperCase() + type.slice(1);
  const coverage = report.total[type].pct;
  const colour = getColour(coverage);

  return `https://img.shields.io/badge/${title}-${coverage}${encodeURI(
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

const reportPath = './coverage/coverage-summary.json';
const outputBasePath = './assets';

readFile(reportPath, 'utf8', (err, res) => {
  if (err) throw err;
  const report = JSON.parse(res);
  ['statements', 'functions', 'branches', 'lines'].forEach((type) => {
    const url = getBadge(report, type);
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
