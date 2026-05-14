const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const LICENSE_FILE = path.join(__dirname, 'licenses.json');

app.use(cors());
app.use(express.json());

function loadLicenses() {
  try {
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
  } catch (error) {
    console.error('Could not read licenses.json:', error.message);
    return [];
  }
}

function clean(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanKey(value) {
  return String(value || '').trim().toUpperCase();
}

app.get('/', (req, res) => {
  res.json({ ok: true, product: 'Relay Contract Refresher License Server' });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/validate-license', (req, res) => {
  const email = clean(req.body.email);
  const licenseKey = cleanKey(req.body.license_key);
  const product = clean(req.body.product || 'relay-contract-refresher');

  if (!email || !licenseKey) {
    return res.json({ ok: true, active: false, reason: 'missing_email_or_license' });
  }

  const licenses = loadLicenses();
  const license = licenses.find(item =>
    clean(item.email) === email &&
    cleanKey(item.license_key) === licenseKey &&
    clean(item.product) === product
  );

  if (!license) {
    return res.json({ ok: true, active: false, reason: 'not_found' });
  }

  if (license.status !== 'active') {
    return res.json({ ok: true, active: false, reason: license.status || 'inactive' });
  }

  const expires = new Date(license.expiresAt).getTime();
  if (!expires || expires <= Date.now()) {
    return res.json({ ok: true, active: false, reason: 'expired', expiresAt: license.expiresAt });
  }

  return res.json({
    ok: true,
    active: true,
    expiresAt: license.expiresAt,
    plan: license.plan || 'standard',
    maxDevices: license.maxDevices || 1
  });
});

app.listen(PORT, () => {
  console.log(`Relay Contract Refresher license server running on port ${PORT}`);
});
