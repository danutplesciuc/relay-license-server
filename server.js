const express = require("express");
const fs = require("fs");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const LICENSE_FILE = "./licenses.json";

function loadLicenses() {
  if (!fs.existsSync(LICENSE_FILE)) {
    fs.writeFileSync(LICENSE_FILE, "[]");
  }

  return JSON.parse(fs.readFileSync(LICENSE_FILE));
}

function saveLicenses(data) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));
}

app.get("/", (req, res) => {
  res.send("Relay Contract Refresher License Server v1.5");
});

app.get("/admin/env-check", (req, res) => {
  res.json({
    ok: true,
    version: "1.5.0",
    stripeLoaded: !!process.env.STRIPE_SECRET_KEY,
    webhookLoaded: !!process.env.STRIPE_WEBHOOK_SECRET,
    adminLoaded: !!process.env.ADMIN_PASSWORD,
  });
});

app.post("/validate-license", (req, res) => {
  try {
    const { key } = req.body;

    const licenses = loadLicenses();

    const found = licenses.find(
      (l) =>
        l.key === key &&
        l.status === "active"
    );

    if (!found) {
      return res.json({
        valid: false,
      });
    }

    const expires = new Date(found.expires);
    const now = new Date();

    if (expires < now) {
      return res.json({
        valid: false,
        reason: "expired",
      });
    }

    res.json({
      valid: true,
      license: found,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      valid: false,
    });
  }
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { email, plan } = req.body;

    let amount = 999;

    if (plan === "starter") {
      amount = 999;
    }

    if (plan === "pro") {
      amount = 1999;
    }

    if (plan === "owner") {
      amount = 4999;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],

      mode: "subscription",

      customer_email: email,

      metadata: {
        email,
        plan,
      },

      line_items: [
        {
          price_data: {
            currency: "gbp",

            product_data: {
              name: `Relay Contract Refresher ${plan}`,
            },

            recurring: {
              interval: "month",
            },

            unit_amount: amount,
          },

          quantity: 1,
        },
      ],

      success_url:
        "https://relay-license-server.onrender.com/success",

      cancel_url:
        "https://relay-license-server.onrender.com/cancel",
    });

    res.json({
      url: session.url,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "checkout_failed",
    });
  }
});

app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(err.message);

      return res.sendStatus(400);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const licenses = loadLicenses();

      const existing = licenses.find(
        (l) => l.email === session.customer_email
      );

      if (!existing) {
        const newLicense = {
          email: session.customer_email,

          key:
            "RCR-" +
            Math.random()
              .toString(36)
              .substring(2, 10)
              .toUpperCase(),

          plan: session.metadata.plan,

          status: "active",

          expires: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split("T")[0],

          maxDevices: 1,

          devices: [],
        };

        licenses.push(newLicense);

        saveLicenses(licenses);

        console.log(
          "New license created:",
          newLicense.key
        );
      }
    }

    res.json({
      received: true,
    });
  }
);

app.get("/success", (req, res) => {
  res.send("Payment successful");
});

app.get("/cancel", (req, res) => {
  res.send("Payment cancelled");
});

app.get("/admin/licenses", (req, res) => {
  const password = req.headers["x-admin-password"];

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.sendStatus(401);
  }

  res.json(loadLicenses());
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(
    "Relay License Server running on port",
    PORT
  );
});
