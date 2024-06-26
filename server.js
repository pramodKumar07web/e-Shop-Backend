const bodyParser = require("body-parser");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");


const { authenticateToken } = require("./services/common");
const productsRouters = require("./routes/Product");
const authRouters = require("./routes/Auth");
const usersRouters = require("./routes/User");
const cartRouters = require("./routes/Cart");
const orderRouters = require("./routes/Order");
const categoriesRouters = require("./routes/Category");
const brandsRouters = require("./routes/Brand");
const stripe = require("stripe")(process.env.STRIPE_SERVER_KEY);

const app = express();
const endpointSecret = process.env.ENDPOINT_SECRET;

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    const sig = request.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    //Handle the event
    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntentSucceeded = event.data.object;
        // console.log(paymentIntentSucceeded);
        const order = await Order.findById(
          paymentIntentSucceeded.metadata.orderId
        );
        order.paymentStatus = "received";
        await order.save();
        // Then define and call a function to handle the event payment_intent.succeeded
        break;
      // ... handle other event types
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    response.send();
  }
);


//data connection
mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => {
    console.log("Database is connected");
    app.listen(process.env.PORT, () => {
      console.log(`server is running on port ${process.env.PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database is not connected", error);
  });

app.use(cors());


app.use(
  cors({
    exposedHeaders: ["X-Total-Count"],
  })
);
app.use(bodyParser.json());
app.use("/products",productsRouters.router)
app.use("/auth",authRouters.router)
app.use("/users",usersRouters.router)
app.use("/cart",cartRouters.router)
app.use("/orders",orderRouters.router)
app.use("/categories",categoriesRouters.router)
app.use("/brands",brandsRouters.router)

// Protected route
app.get("/protected-route", authenticateToken, (req, res) => {
  // Access user information from req.user
  const userId = req.user.userId;
  const userEmail = req.user.email;

  res.json({ Message: "This is a Protected Route", userId, userEmail });
});

app.post("/create-payment-intent", async (req, res) => {
  const { totalAmount, orderId } = req.body;

  // Define the minimum amount allowed for your currency (e.g., 50 cents for USD)
  const minimumAmount = 50; // in cents
  const currency = "usd"; // define your currency

  if (totalAmount < minimumAmount / 100) {
    return res.status(400).json({
      message: `Amount must be at least ${minimumAmount / 100} ${currency}.`,
    });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Amount in cents
      currency: currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        orderId,
      },
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});
