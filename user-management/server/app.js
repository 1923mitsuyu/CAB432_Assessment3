const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require('cors');
const knex = require("knex");
const swaggerUI = require("swagger-ui-express");
const swaggerDocument = require("./docs/openapi.json");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
require('dotenv').config();
const app = express();

const client = new SecretsManagerClient({ region: "ap-southeast-2" });
const secretName = process.env.SECRET_NAME;
SSM = require("@aws-sdk/client-ssm");
const client2 = new SSM.SSMClient({ region: "ap-southeast-2" });

const hostParameterName = process.env.HOST_PARAMETER_NAME;
const databaseParameterName = process.env.DATABASE_PARAMETER_NAME;

async function getParameters() {
  try {

    // Retrieve the host parameter
    const hostResponse = await client2.send(
      new SSM.GetParameterCommand({
        Name: hostParameterName
      })
     );

    // Retrieve the database parameter
    const databaseResponse = await client2.send(
      new SSM.GetParameterCommand({
         Name: databaseParameterName
      })
   );
  
    // Log the values
    console.log(`Host: ${hostResponse.Parameter.Value}`);
    console.log(`Database: ${databaseResponse.Parameter.Value}`);

    return {
      host: hostResponse.Parameter.Value,
      database: databaseResponse.Parameter.Value
   };

  } catch (error) {
     console.log(error);
  }
}

// Middleware setup
app.use(cors({
  origin: [
    'http://ec2-13-239-32-88.ap-southeast-2.compute.amazonaws.com:3000',
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

// Function to get secret from AWS Secrets Manager
async function getSecret(secretName) {
  try {
    const response = await client.send(new GetSecretValueCommand({
      SecretId: secretName,
      VersionStage: "AWSCURRENT",
    }));
    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error("Error retrieving secret:", error);
    throw error; 
  }
}

// Function to initialize the database
async function initializeDatabase() {
  try {

    const secret = await getSecret(secretName);
    const { host, database } = await getParameters();
    const dbConfig = {
      client: 'mysql2',
      connection: {
        host: host,  
        database: database,  
        user: secret.username,
        password: secret.password,
        port: secret.port || 3306,
      },
    };

    app.locals.db = knex(dbConfig); 
    await app.locals.db.raw('SELECT 1'); 
    console.log("Connected to RDS database!");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
}

// Initialize the database and start the server
(async () => {
  try {
    await initializeDatabase();
    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    process.exit(1); 
  }
})();

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

// Export the app
module.exports = app;
