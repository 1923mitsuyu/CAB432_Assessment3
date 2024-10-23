const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require('cors');
const knex = require("knex");
const swaggerUI = require("swagger-ui-express");
const swaggerDocument = require("./docs/openapi.json");
require('dotenv').config();
const app = express();

// Middleware setup
app.use(cors({
  origin: [
    'http://ec2-13-239-140-16.ap-southeast-2.compute.amazonaws.com:3000',
    'http://localhost:3001', 
    'http://localhost:3000'
  ],
  methods: ["GET", "POST"],
}));

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use("/docs", swaggerUI.serve, swaggerUI.setup(swaggerDocument));

// Routes
app.use("/", require("./routes/index"));
app.use("/users", require("./routes/users"));
app.use("/version", async (req, res) => {
  try {
    const version = await req.app.locals.db.raw("SELECT VERSION()");
    res.send(version[0][0]);
  } catch (error) {
    console.error("Error fetching version:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Error handling
app.use((req, res, next) => {
  next(createError(404));
});

app.use((err, req, res, next) => {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

const port = process.env.PORT || 3001;
  app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app; 


