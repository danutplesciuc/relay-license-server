const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const LICENSE_FILE = path.join(__dirname, 'licenses.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CHANGE_ME_RELAY_2026';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function loadLicenses() {
  try {
    const raw = fs.readFileSync(LICENSE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Could not read licenses.json:', error.message);
    return [];
  }
}

function saveLicenses(licenses) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenses, null, 2));
}

function clean(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanKey(value) {
  return String(value || '').trim().toUpperCase();
}

function makeLicenseKey() {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RCR-${part()}-${part()}-${new Date().getFullYear()}`;
}

function requireAdmin(req, res, next) {
  const provided = req.headers['x-admin-password'] || req.query.password;
  if (!provided || String(provided) !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'unauthorised' });
  }
  next();
}

function normaliseLicense(input) {
  const email = clean(input.email);
  const license_key = cleanKey(input.license_key || input.licenseKey || makeLicenseKey());
  const product = clean(input.product || 'relay-contract-refresher');
  const status = clean(input.status || 'active');
  const plan = clean(input.plan || 'standard');
  const maxDevices = Number(input.maxDevices || input.max_devices || 1);
  const expiresAt = input.expiresAt || input.expires_at || new Date(Date.now() + 30 * 86400000).toISOString();

  if (!email) throw new Error('email_required');
  if (!license_key) throw new Error('license_key_required');

  return {
    email,
    license_key,
    product,
    status,
    plan,
    expiresAt: new Date(expiresAt).toISOString(),
    maxDevices: Math.max(1, maxDevices)
  };
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    product: 'Relay Contract Refresher License Server',
    version: '1.4.0',
    admin: '/admin',
    validate: '/validate-license'
  });
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

app.get('/admin', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relay Tools Admin</title>
  <style>
    body{margin:0;background:#0b1220;color:#e5e7eb;font-family:Arial,sans-serif} .wrap{max-width:1100px;margin:0 auto;padding:24px}
    h1{margin:0 0 6px;font-size:28px}.sub{color:#94a3b8;margin-bottom:22px}.card{background:#111827;border:1px solid #243244;border-radius:18px;padding:18px;margin-bottom:18px;box-shadow:0 15px 45px rgba(0,0,0,.25)}
    input,select,button{border:0;border-radius:10px;padding:11px;font-size:14px} input,select{background:#1f2937;color:white;border:1px solid #334155} button{background:#22c55e;color:#052e16;font-weight:900;cursor:pointer} button.danger{background:#ef4444;color:white} button.warn{background:#f59e0b;color:#111827} button.copy{background:#64748b;color:white}
    .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.grid label{display:flex;flex-direction:column;gap:6px;color:#cbd5e1;font-size:12px}.actions{display:flex;gap:8px;flex-wrap:wrap}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
    table{width:100%;border-collapse:collapse;font-size:13px} th,td{text-align:left;padding:11px;border-bottom:1px solid #243244;vertical-align:middle} th{color:#93c5fd}.pill{display:inline-block;padding:4px 8px;border-radius:999px;font-weight:900;font-size:12px}.active{background:#14532d;color:#86efac}.inactive{background:#451a1a;color:#fecaca}.muted{color:#94a3b8}.msg{min-height:20px;color:#86efac;font-weight:700}.hide{display:none}
    @media(max-width:900px){.grid{grid-template-columns:1fr 1fr} table{font-size:12px}.wrap{padding:14px}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div><h1>Relay Tools Admin</h1><div class="sub">Relay Contract Refresher license manager</div></div>
    <div class="actions"><button class="copy" onclick="loadLicenses()">Refresh</button><button class="danger" onclick="logout()">Logout</button></div>
  </div>

  <div id="login" class="card">
    <h2>Admin login</h2>
    <p class="muted">Enter your admin password from Render environment variable ADMIN_PASSWORD.</p>
    <input id="password" type="password" placeholder="Admin password" style="width:280px;max-width:100%">
    <button onclick="login()">Login</button>
  </div>

  <div id="app" class="hide">
    <div class="card">
      <h2>Add or update license</h2>
      <div class="grid">
        <label>Email<input id="email" placeholder="client@email.com"></label>
        <label>License Key<input id="license_key" placeholder="auto if empty"></label>
        <label>Plan<select id="plan"><option>starter</option><option>pro</option><option>fleet</option><option>owner</option><option>demo</option></select></label>
        <label>Status<select id="status"><option>active</option><option>inactive</option><option>cancelled</option></select></label>
        <label>Expires<input id="expiresAt" type="date"></label>
        <label>Max devices<input id="maxDevices" type="number" value="1" min="1"></label>
      </div>
      <div class="actions" style="margin-top:12px"><button onclick="saveLicense()">Save license</button><button class="copy" onclick="clearForm()">Clear form</button><button class="warn" onclick="generateKey()">Generate key</button></div>
      <div id="msg" class="msg"></div>
    </div>

    <div class="card">
      <h2>Licenses</h2>
      <div style="overflow:auto"><table><thead><tr><th>Email</th><th>Key</th><th>Plan</th><th>Status</th><th>Expires</th><th>Devices</th><th>Actions</th></tr></thead><tbody id="rows"></tbody></table></div>
    </div>
  </div>
</div>
<script>
let adminPassword = localStorage.getItem('rcr_admin_password') || '';
function $(id){return document.getElementById(id)}
function headers(){return {'Content-Type':'application/json','x-admin-password':adminPassword}}
function showMsg(text,bad=false){$('msg').style.color=bad?'#fecaca':'#86efac';$('msg').textContent=text;setTimeout(()=>$('msg').textContent='',3500)}
function login(){adminPassword=$('password').value;localStorage.setItem('rcr_admin_password',adminPassword);loadLicenses()}
function logout(){localStorage.removeItem('rcr_admin_password');adminPassword='';$('app').classList.add('hide');$('login').classList.remove('hide')}
function generateKey(){const p=()=>Math.random().toString(36).slice(2,6).toUpperCase();$('license_key').value='RCR-'+p()+'-'+p()+'-'+new Date().getFullYear()}
function clearForm(){['email','license_key'].forEach(id=>$(id).value='');$('plan').value='starter';$('status').value='active';$('maxDevices').value=1;defaultDate()}
function defaultDate(){const d=new Date();d.setMonth(d.getMonth()+1);$('expiresAt').value=d.toISOString().slice(0,10)}
async function loadLicenses(){
  if(!adminPassword){$('login').classList.remove('hide');$('app').classList.add('hide');return}
  const res=await fetch('/admin/licenses',{headers:headers()});
  if(res.status===401){logout();return}
  const data=await res.json();
  $('login').classList.add('hide');$('app').classList.remove('hide');
  $('rows').innerHTML=(data.licenses||[]).map(l=>'<tr><td>'+l.email+'</td><td><code>'+l.license_key+'</code></td><td>'+l.plan+'</td><td><span class="pill '+(l.status==='active'?'active':'inactive')+'">'+l.status+'</span></td><td>'+new Date(l.expiresAt).toLocaleDateString()+'</td><td>'+l.maxDevices+'</td><td class="actions"><button class="copy" onclick=\'editLicense('+JSON.stringify(l).replaceAll("'","&apos;")+')\'>Edit</button><button class="warn" onclick=\'toggleLicense("'+l.license_key+'")\'>Toggle</button><button class="danger" onclick=\'deleteLicense("'+l.license_key+'")\'>Delete</button></td></tr>').join('');
}
function editLicense(l){$('email').value=l.email;$('license_key').value=l.license_key;$('plan').value=l.plan||'starter';$('status').value=l.status||'active';$('expiresAt').value=new Date(l.expiresAt).toISOString().slice(0,10);$('maxDevices').value=l.maxDevices||1;window.scrollTo({top:0,behavior:'smooth'})}
async function saveLicense(){
  const body={email:$('email').value,license_key:$('license_key').value,plan:$('plan').value,status:$('status').value,expiresAt:$('expiresAt').value,maxDevices:$('maxDevices').value};
  const res=await fetch('/admin/licenses',{method:'POST',headers:headers(),body:JSON.stringify(body)}); const data=await res.json();
  if(!data.ok){showMsg(data.error||'Error',true);return} showMsg('Saved: '+data.license.license_key); clearForm(); loadLicenses();
}
async function toggleLicense(key){await fetch('/admin/licenses/toggle',{method:'POST',headers:headers(),body:JSON.stringify({license_key:key})});loadLicenses()}
async function deleteLicense(key){if(!confirm('Delete license '+key+'?'))return;await fetch('/admin/licenses/delete',{method:'POST',headers:headers(),body:JSON.stringify({license_key:key})});loadLicenses()}
defaultDate(); loadLicenses();
</script>
</body></html>`);
});

app.get('/admin/licenses', requireAdmin, (req, res) => {
  res.json({ ok: true, licenses: loadLicenses() });
});

app.post('/admin/licenses', requireAdmin, (req, res) => {
  try {
    const next = normaliseLicense(req.body);
    const licenses = loadLicenses();
    const index = licenses.findIndex(item => cleanKey(item.license_key) === next.license_key);
    if (index >= 0) licenses[index] = { ...licenses[index], ...next };
    else licenses.push(next);
    saveLicenses(licenses);
    res.json({ ok: true, license: next });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/admin/licenses/toggle', requireAdmin, (req, res) => {
  const key = cleanKey(req.body.license_key);
  const licenses = loadLicenses();
  const license = licenses.find(item => cleanKey(item.license_key) === key);
  if (!license) return res.status(404).json({ ok: false, error: 'not_found' });
  license.status = license.status === 'active' ? 'inactive' : 'active';
  saveLicenses(licenses);
  res.json({ ok: true, license });
});

app.post('/admin/licenses/delete', requireAdmin, (req, res) => {
  const key = cleanKey(req.body.license_key);
  const licenses = loadLicenses();
  const next = licenses.filter(item => cleanKey(item.license_key) !== key);
  saveLicenses(next);
  res.json({ ok: true, deleted: licenses.length - next.length });
});

app.listen(PORT, () => {
  console.log(`Relay Contract Refresher license server v1.4 running on port ${PORT}`);
});
