
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());

app.post('/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 10000;

const LICENSES_FILE = path.join(__dirname, 'licenses.json');

function loadLicenses() {
  try {
    return JSON.parse(fs.readFileSync(LICENSES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveLicenses(data) {
  fs.writeFileSync(LICENSES_FILE, JSON.stringify(data, null, 2));
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    version: '2.2.0',
    checkout: '/create-checkout-session',
    webhook: '/stripe/webhook'
  });
});

app.post('/create-checkout-session', async (req, res) => {
  try {

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'Email required'
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,

      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],

      subscription_data: {
        trial_period_days: 7
      },

      success_url: `${process.env.APP_URL}/success`,
      cancel_url: `${process.env.APP_URL}/cancel`
    });

    res.json({
      ok: true,
      url: session.url
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      ok: false,
      error: 'Stripe checkout failed'
    });
  }
});

app.post('/stripe/webhook', async (req, res) => {

  const sig = req.headers['stripe-signature'];

  let event;

  try {

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

  } catch (err) {

    console.log('Webhook signature failed');

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const licenses = loadLicenses();

  if (event.type === 'checkout.session.completed') {

    const session = event.data.object;

    const email = session.customer_email;

    const existing = licenses.find(
      l => l.email.toLowerCase() === email.toLowerCase()
    );

    if (!existing) {

      const key =
        'RCR-' +
        Math.random().toString(36).substring(2, 8).toUpperCase() +
        '-2026';

      licenses.push({
        email,
        license_key: key,
        product: 'relay-contract-refresher',
        status: 'active',
        plan: 'pro',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        maxDevices: 1,
        devices: []
      });

      saveLicenses(licenses);

      console.log('License created for', email);
    }
  }

  if (
    event.type === 'customer.subscription.deleted' ||
    event.type === 'invoice.payment_failed'
  ) {

    const obj = event.data.object;

    const customerEmail =
      obj.customer_email ||
      obj.customer_details?.email;

    if (customerEmail) {

      const lic = licenses.find(
        l => l.email.toLowerCase() === customerEmail.toLowerCase()
      );

      if (lic) {

        lic.status = 'inactive';

        saveLicenses(licenses);

        console.log('License disabled for', customerEmail);
      }
    }
  }

  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log('Relay License Server V2.2 running on port', PORT);
});
